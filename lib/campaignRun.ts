import { RETENTION_TEXT, audienceRows, renderHtml, type Audience, type Segment } from "./campaign";
import { campaignAllowance, deliverCampaignBatch, reconcileFailed, type MailCategory } from "./mail";
import { db, ensureSchema } from "./server";

export type BatchResult = { ok: true; sent: number; more: boolean; held: string | null; done: boolean } | { ok: false; status: number; error: string };

/**
 * 캠페인 발송 한 배치(관리자 화면과 매일 자동 발송이 같이 쓴다).
 * 이미 이 캠페인으로 기록된 주소는 대상에서 빠지므로 중복 발송되지 않는다.
 * 발송 정지(꺼짐·야간·한도·Resend 한도) 상태를 만나면 배치를 멈추고 held 사유를 돌려준다.
 * 하루 한도(관리자 메일 설정, 기본 500통)는 모든 캠페인 메일을 합쳐 센다. 실제 발송은 Resend 묶음 발송(100통씩).
 */
export async function runCampaignBatch(id: string, limit: number): Promise<BatchResult> {
  await ensureSchema();
  // Resend에서 나중에 실패한 일괄 발송분을 먼저 '다시 보낼 대상'으로 돌린다(3분에 한 번).
  await reconcileFailed();
  const sql = db();
  const found = await sql`select * from mail_campaigns where id = ${id}`;
  const c = found[0];
  if (!c) return { ok: false, status: 404, error: "캠페인을 찾을 수 없습니다." };
  if (c.status === "cancelled") return { ok: false, status: 409, error: "취소된 캠페인입니다." };
  if (c.status === "draft") await sql`update mail_campaigns set status = 'sending', started_at = now() where id = ${id}`;

  const a: Audience = { segment: c.segment as Segment, onlyConsent: !!c.only_consent, onlyDriver: !!c.only_driver, marketing: c.category === "marketing", subject: String(c.subject ?? "") };
  const category = c.category as MailCategory;
  const before = new Date(c.created_at as string).toISOString();
  // 오늘 남은 한도만큼만 꺼낸다.
  // 하루 한도를 정했으면 그 값, 0(자동)이면 월 한도를 남은 날수로 나눈 몫. Resend가 429를 주면 quota로 멈춘다.
  const { left } = await campaignAllowance();
  if (left <= 0) return { ok: true, sent: 0, more: true, held: "cap", done: false };
  const rows = await audienceRows(a, { campaignId: id, before, limit: Math.min(limit, left) });
  if (rows.length === 0) {
    if (c.status !== "done") await sql`update mail_campaigns set status = 'done', finished_at = now() where id = ${id}`;
    return { ok: true, sent: 0, more: false, held: null, done: true };
  }
  // 완료된 캠페인에 실패분(한도 초과)이 남아 있으면 다시 발송 중으로 돌린다
  if (c.status === "done") await sql`update mail_campaigns set status = 'sending', finished_at = null where id = ${id}`;

  const html = renderHtml(c.body as string);
  const text = `${String(c.body).replace(/\{\{img:[0-9a-f-]{36}\}\}/g, "[이미지]")}\n\n${RETENTION_TEXT}`;
  const r = await deliverCampaignBatch(rows.map((x) => ({ kind: "campaign", category, to: x.email, userId: x.user_id, subject: c.subject as string, html, text, campaignId: id })));
  const sent = r.sent;
  const held = r.held === "off" || r.held === "quiet" || r.held === "cap" || r.held === "quota" ? r.held : null;
  // 아직 남은 대상이 있는지만 확인한다 (이번 배치에서 기록된 주소는 제외됨)
  const more = (await audienceRows(a, { campaignId: id, before, limit: 1 })).length > 0;
  const done = !held && !more;
  if (done) await sql`update mail_campaigns set status = 'done', finished_at = now() where id = ${id}`;
  return { ok: true, sent, more, held, done };
}
