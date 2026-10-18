import { audienceRows, renderHtml, type Audience, type Segment } from "@/lib/campaign";
import { deliverWithStatus, type MailCategory } from "@/lib/mail";
import { db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, body } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 캠페인 발송 한 배치. 클라이언트가 remaining 0이 될 때까지 반복 호출한다.
 * 이미 이 캠페인으로 기록된 주소는 대상에서 빠지므로 중복 발송되지 않는다.
 * 발송 정지(꺼짐·야간·한도) 상태를 만나면 배치를 멈추고 held 사유를 돌려준다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "잘못된 캠페인입니다." }, 400);
  const b = await body(req);
  const limit = Math.min(Math.max(Number(b.limit) || 50, 1), 200);
  try {
    await ensureSchema();
    const sql = db();
    const found = await sql`select * from mail_campaigns where id = ${id}`;
    const c = found[0];
    if (!c) return json({ error: "캠페인을 찾을 수 없습니다." }, 404);
    if (c.status === "cancelled") return json({ error: "취소된 캠페인입니다." }, 409);
    if (c.status === "done") return json({ ok: true, sent: 0, more: false, held: null, done: true });
    if (c.status === "draft") await sql`update mail_campaigns set status = 'sending', started_at = now() where id = ${id}`;

    const a: Audience = { segment: c.segment as Segment, onlyConsent: !!c.only_consent, onlyDriver: !!c.only_driver, marketing: c.category === "marketing", subject: String(c.subject ?? "") };
    const category = c.category as MailCategory;
    const before = new Date(c.created_at as string).toISOString();
    const rows = await audienceRows(a, { campaignId: id, before, limit });
    if (rows.length === 0) {
      await sql`update mail_campaigns set status = 'done', finished_at = now() where id = ${id}`;
      return json({ ok: true, sent: 0, more: false, held: null, done: true });
    }

    let sent = 0;
    let held: string | null = null;
    for (const r of rows) {
      const status = await deliverWithStatus({
        kind: "campaign",
        category,
        to: r.email,
        userId: r.user_id,
        subject: c.subject as string,
        html: renderHtml(c.body as string),
        text: String(c.body).replace(/\{\{img:[0-9a-f-]{36}\}\}/g, "[이미지]"),
        campaignId: id,
      });
      if (status === "sent") sent++;
      if (status === "off" || status === "quiet" || status === "cap") {
        held = status;
        break;
      }
    }
    // 아직 남은 대상이 있는지만 확인한다 (이번 배치에서 기록된 주소는 제외됨)
    const more = (await audienceRows(a, { campaignId: id, before, limit: 1 })).length > 0;
    const done = !held && !more;
    if (done) await sql`update mail_campaigns set status = 'done', finished_at = now() where id = ${id}`;
    return json({ ok: true, sent, more, held, done });
  } catch (e) {
    return fail(e);
  }
}
