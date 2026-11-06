import { sendPush } from "./push";
import { db, ensureSchema } from "./server";
import { SAFETY_INTERVAL_MIN, SAFETY_LATE_MIN, SAFETY_OVERDUE_MIN } from "./safety";
import { notifySafetyAlert } from "./safetyNotify";

/**
 * 안심동행 안심 체크를 서버가 푸시로 보낸다(2026-11-06 사용자 지시: 푸시는 필수, 화면을 닫아 둬도 확인).
 * - 탑승 뒤 10분마다 "불편함은 없으신가요?" 질문 + 푸시(누르면 대화방이 열리고 답하면 체크 완료)
 * - 3분 안에 답이 없으면 한 번 더 푸시하고 운영팀에 '무응답' 메일(세션당 한 번)
 * - 예상 도착 시각 + 10분이 지나도 [도착했어요]가 없으면 '도착 지연' 푸시 + 운영팀 메일
 * 질문은 예상 도착 시각까지만(없으면 탑승 뒤 60분까지). 모든 갱신은 조건부 update라 여러 곳에서 동시에 돌아도 한 번만 된다.
 */
const NO_ETA_MIN = 60;

export async function runSafetyChecks() {
  const sql = db();
  const room = (r: Record<string, unknown>) => `/?room=${r.request_id}`;

  // 1) 새 질문
  const asks = await sql`update safety_sessions set pending_since = now(), last_ask_at = now(), reminded_at = null
    where status = 'active' and boarded_at is not null and pending_since is null and urgent_at is null
      and coalesce(last_ask_at, boarded_at) < now() - make_interval(mins => ${SAFETY_INTERVAL_MIN})
      and now() < coalesce(eta_at, boarded_at + make_interval(mins => ${NO_ETA_MIN}))
    returning id, rider_id, request_id`;
  for (const r of asks) {
    await sendPush(String(r.rider_id), { title: "안심동행 확인", body: "이동하는 데 불편함은 없으신가요? 눌러서 답해 주세요.", url: room(r), tag: `safety-ask-${r.id}` });
  }

  // 2) 답이 없으면 다시 알림 + 운영팀 메일
  const late = await sql`update safety_sessions set reminded_at = now()
    where status = 'active' and pending_since is not null and reminded_at is null
      and pending_since < now() - make_interval(mins => ${SAFETY_OVERDUE_MIN})
    returning id, rider_id, request_id, overdue_mailed_at`;
  for (const r of late) {
    await sendPush(String(r.rider_id), { title: "안심동행 확인을 기다리고 있어요", body: "괜찮으신지 눌러서 알려 주세요. 운영팀이 함께 지켜보고 있어요.", url: room(r), tag: `safety-ask-${r.id}` });
    const flag = await sql`update safety_sessions set overdue_mailed_at = now() where id = ${r.id} and overdue_mailed_at is null returning id`;
    if (flag.length) await notifySafetyAlert("overdue", String(r.id)).catch(() => {});
  }

  // 3) 도착 지연
  const lateArr = await sql`update safety_sessions set late_at = now()
    where status = 'active' and eta_at is not null and late_at is null
      and eta_at < now() - make_interval(mins => ${SAFETY_LATE_MIN})
    returning id, rider_id, request_id`;
  for (const r of lateArr) {
    await sendPush(String(r.rider_id), { title: "도착하셨나요?", body: "예상 도착 시각이 지났어요. 도착했으면 [도착했어요]를 눌러 주세요.", url: room(r), tag: `safety-late-${r.id}` });
    await notifySafetyAlert("late", String(r.id)).catch(() => {});
  }
  return { asked: asks.length, reminded: late.length, late: lateArr.length };
}

let lastTry = 0;
/** 응답 뒤(after)에 불러 쓴다. 인스턴스마다 1분에 한 번, 전체로도 1분에 한 번만 실제로 돈다. */
export async function maybeRunSafetyChecks() {
  if (Date.now() - lastTry < 60_000) return;
  lastTry = Date.now();
  await ensureSchema();
  const active = await db()`select 1 from safety_sessions where status = 'active' limit 1`;
  if (!active.length) return;
  const claim = await db()`insert into settings (key, value) values ('safety_job_at', ${String(Date.now())})
    on conflict (key) do update set value = excluded.value
    where settings.value::bigint < ${Date.now() - 55_000} returning value`;
  if (claim.length) await runSafetyChecks();
}
