import { alertAdmin } from "@/lib/adminAlert";
import { runCampaignBatch } from "@/lib/campaignRun";
import { db, ensureSchema, hasDb, json } from "@/lib/server";

const HELD_TEXT: Record<string, string> = {
  cap: "오늘 하루 발송 한도에 도달해 멈춤(내일 이어서 발송)",
  quota: "메일 서비스 한도에 걸려 멈춤(한도가 풀리면 이어서 발송)",
  off: "발송 정책이 꺼져 있어 멈춤",
  quiet: "야간 발송 제한 시간이라 멈춤",
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 매일 9시 10분·12시 10분(KST) 두 번 '자동 이어 보내기'를 켠 캠페인을 이어서 보낸다.
 * 하루 한도(관리자 메일 정책·Resend 한도)에 닿으면 멈추고 다음 날 다시 이어 간다. 이미 받은 사람에게는 다시 가지 않는다.
 * Vercel 예약 실행이 부른다. 환경변수 CRON_SECRET이 있어야 하고, 요청 헤더가 그 값과 맞아야 한다.
 */
/** Vercel 실행 제한(60초)보다 여유를 두고, 이 시간이 지나면 새 배치를 시작하지 않는다. */
const BUDGET_MS = 30_000;
/** 한 배치 = 100명(Resend 묶음 1회). 짧게 나눠 보내 시간 초과를 피한다. */
const BATCH = 100;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "권한이 없어요." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  await ensureSchema();
  const started = Date.now();
  // 마지막 실행이 오래된 캠페인부터 돌린다(앞 캠페인이 실행 시간을 다 써서 뒤 캠페인이 굶지 않게)
  const list = await db()`select c.id, c.title from mail_campaigns c where c.auto and c.status in ('sending','done')
    order by (select max(r.created_at) from mail_runs r where r.campaign_id = c.id) nulls first, c.created_at`;
  const report: { id: string; title: string; sent: number; held: string | null; done: boolean; note: string }[] = [];
  for (const c of list) {
    let sent = 0;
    let held: string | null = null;
    let done = false;
    let note = "";
    const t0 = Date.now();
    try {
      for (;;) {
        if (Date.now() - started > BUDGET_MS) {
          note = "시간 여유를 위해 여기서 멈춤(다음 실행에 이어서 보냄)";
          break;
        }
        const r = await runCampaignBatch(String(c.id), BATCH);
        if (!r.ok) {
          note = r.error;
          break;
        }
        sent += r.sent;
        held = r.held;
        done = r.done;
        if (r.held || r.done || !r.more) break;
      }
    } catch (e) {
      note = `오류: ${e instanceof Error ? e.message.slice(0, 200) : "알 수 없음"}`;
    }
    if (done) await db()`update mail_campaigns set auto = false where id = ${c.id}`;
    const ms = Date.now() - t0;
    await db()`insert into mail_runs (source, campaign_id, campaign_title, sent, held, done, ms, note)
      values ('자동 발송', ${c.id}, ${String(c.title)}, ${sent}, ${held}, ${done}, ${ms}, ${note})`;
    report.push({ id: String(c.id), title: String(c.title), sent, held, done, note });
    // 이번 실행에서 보낸 게 있거나 끝났으면 관리자에게 알린다(하루 분 종료 또는 완료).
    if (sent > 0 || done) {
      const total = await db()`select count(*)::int as n from mail_log where campaign_id = ${c.id} and status = 'sent'`;
      await alertAdmin(
        done ? `[모두의카풀 관리] 메일 발송 완료: ${c.title}` : `[모두의카풀 관리] 오늘 분 발송 종료: ${c.title}`,
        [
          ["이번 실행 발송", `${sent.toLocaleString()}명`],
          ["캠페인 누적 발송", `${Number(total[0]?.n ?? 0).toLocaleString()}건`],
          ["상태", done ? "모든 대상에게 발송 완료(자동 발송 꺼짐)" : (held ? (HELD_TEXT[held] ?? held) : "남은 대상 있음(다음 실행에 이어서)")],
        ],
      );
    }
    // 하루 한도에 닿았으면 다른 캠페인도 오늘은 못 보낸다.
    if (held === "cap" || held === "quota") break;
    if (Date.now() - started > BUDGET_MS) break;
  }
  return json({ ok: true, report });
}
