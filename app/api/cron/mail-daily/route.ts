import { runCampaignBatch } from "@/lib/campaignRun";
import { db, ensureSchema, hasDb, json } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 매일 아침(한국 시각 9시 10분 무렵, 발송 한도가 풀린 직후) '자동 이어 보내기'를 켠 캠페인을 이어서 보낸다.
 * 하루 한도(관리자 메일 정책·Resend 한도)에 닿으면 멈추고 다음 날 다시 이어 간다. 이미 받은 사람에게는 다시 가지 않는다.
 * Vercel 예약 실행이 부른다. 환경변수 CRON_SECRET이 있어야 하고, 요청 헤더가 그 값과 맞아야 한다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "권한이 없어요." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  await ensureSchema();
  const started = Date.now();
  const list = await db()`select id, title from mail_campaigns where auto and status in ('sending','done') order by created_at`;
  const report: { id: string; title: string; sent: number; held: string | null; done: boolean }[] = [];
  for (const c of list) {
    let sent = 0;
    let held: string | null = null;
    let done = false;
    // 한 번에 50명씩, 50초 안에서 이어 보낸다.
    while (Date.now() - started < 50_000) {
      const r = await runCampaignBatch(String(c.id), 50);
      if (!r.ok) break;
      sent += r.sent;
      held = r.held;
      done = r.done;
      if (r.held || r.done || !r.more) break;
    }
    if (done) await db()`update mail_campaigns set auto = false where id = ${c.id}`;
    report.push({ id: String(c.id), title: String(c.title), sent, held, done });
    // 하루 한도에 닿았으면 다른 캠페인도 오늘은 못 보낸다.
    if (held === "cap" || held === "quota") break;
  }
  return json({ ok: true, report });
}
