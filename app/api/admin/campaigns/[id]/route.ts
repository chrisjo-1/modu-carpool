import { parseAudience } from "@/lib/campaign";
import type { MailCategory } from "@/lib/mail";
import { body, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 캠페인 취소(본문 없음) 또는 매일 자동 이어 보내기 켜고 끄기(`{auto: boolean}`).
 * 취소: 이미 발송된 메일은 되돌리지 않고, 아직 나가지 않은 대상만 멈춘다.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "잘못된 캠페인입니다." }, 400);
  try {
    await ensureSchema();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof b.auto === "boolean") {
      await db()`update mail_campaigns set auto = ${b.auto} where id = ${id} and status in ('sending','done')`;
      return json({ ok: true, auto: b.auto });
    }
    await db()`update mail_campaigns set status = 'cancelled', finished_at = now(), auto = false where id = ${id} and status in ('draft','sending')`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 초안 내용 고치기(저장). 발송 시작 전(draft)인 캠페인만 고칠 수 있다. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "잘못된 캠페인입니다." }, 400);
  const b = await body(req);
  const a = parseAudience(b);
  if (!a) return json({ error: "대상이 올바르지 않습니다." }, 400);
  const category: MailCategory = b.category === "marketing" ? "marketing" : "transactional";
  const title = text(b.title, 80);
  const subject = text(b.subject, 200);
  const bodyText = text(b.body, 5000);
  if (!title || !subject || !bodyText) return json({ error: "제목, 메일 제목, 본문을 모두 입력해 주세요." }, 400);
  if (category === "marketing" && a.onlyConsent === false) return json({ error: "광고성 메일은 마케팅 동의 회원에게만 보낼 수 있어요." }, 400);
  try {
    await ensureSchema();
    const rows = await db()`update mail_campaigns set title = ${title}, category = ${category}, segment = ${a.segment},
        only_consent = ${a.onlyConsent}, only_driver = ${a.onlyDriver}, subject = ${subject}, body = ${bodyText}
      where id = ${id} and status = 'draft' returning id`;
    if (!rows.length) return json({ error: "발송 전 초안만 고칠 수 있어요. 이미 발송했거나 취소된 캠페인입니다." }, 409);
    return json({ ok: true, id });
  } catch (e) {
    return fail(e);
  }
}
