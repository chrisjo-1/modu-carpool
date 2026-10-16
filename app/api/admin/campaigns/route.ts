import { audienceRows, parseAudience, SEGMENTS, TEMPLATES, type Audience, type Segment } from "@/lib/campaign";
import { getPolicy, type MailCategory } from "@/lib/mail";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 캠페인 목록과 템플릿·대상 옵션 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`
      select c.id, c.created_at, c.title, c.category, c.segment, c.only_consent, c.only_driver, c.subject, c.status, c.started_at, c.finished_at,
        (select count(*)::int from mail_log g where g.campaign_id = c.id and g.status = 'sent') as sent,
        (select count(*)::int from mail_log g where g.campaign_id = c.id and g.status in ('failed','blocked')) as failed
      from mail_campaigns c order by c.created_at desc limit 100`;
    const policy = await getPolicy();
    return json({
      policy,
      segments: SEGMENTS.map(([key, label]) => ({ key, label })),
      templates: TEMPLATES.map(({ key, label, category, subject, body }) => ({ key, label, category, subject, body })),
      campaigns: rows.map((r) => ({
        ...r,
        created_at: new Date(r.created_at as string).getTime(),
        started_at: r.started_at ? new Date(r.started_at as string).getTime() : null,
        finished_at: r.finished_at ? new Date(r.finished_at as string).getTime() : null,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** 미리보기용 대상 수 계산 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  if (b.action === "count") {
    try {
      await ensureSchema();
      const a = parseAudience(b);
      if (!a) return json({ error: "대상이 올바르지 않습니다." }, 400);
      const rows = await audienceRows(a, { limit: 100000 });
      return json({ count: rows.length });
    } catch (e) {
      return fail(e);
    }
  }
  // 초안 생성: 발송 전 검토용으로 저장만 한다. 실제 발송은 run 단계에서 한다.
  const a = parseAudience(b);
  if (!a) return json({ error: "대상이 올바르지 않습니다." }, 400);
  const category: MailCategory = b.category === "marketing" ? "marketing" : "transactional";
  const title = text(b.title, 80);
  const subject = text(b.subject, 200);
  const bodyText = text(b.body, 5000);
  if (!title || !subject || !bodyText) return json({ error: "제목, 메일 제목, 본문을 모두 입력해 주세요." }, 400);
  if (category === "marketing" && (a.onlyConsent === false)) {
    // 광고성 메일은 동의 회원만 보내는 것을 기본으로 하며, 해제는 허용하지 않는다
    return json({ error: "광고성 메일은 마케팅 동의 회원에게만 보낼 수 있어요." }, 400);
  }
  try {
    await ensureSchema();
    const rows = await db()`insert into mail_campaigns (title, category, segment, only_consent, only_driver, subject, body, status)
      values (${title}, ${category}, ${a.segment}, ${a.onlyConsent}, ${a.onlyDriver}, ${subject}, ${bodyText}, 'draft')
      returning id`;
    return json({ ok: true, id: rows[0].id });
  } catch (e) {
    return fail(e);
  }
}

