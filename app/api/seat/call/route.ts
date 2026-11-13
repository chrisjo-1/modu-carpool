import { currentUserId, db, fail, json, needLogin } from "@/lib/server";
import { callAll, parseTodayRide, seatDbReady, todayPlan } from "@/lib/seatDb";
import { setupAlightAlert } from "@/lib/seatAlight";
import { seatPush } from "@/lib/seatNotify";
import { getRules, grant, kstDay } from "@/lib/credits";

export const dynamic = "force-dynamic";

/**
 * 지하철 '앉았어요': 같은 노선·같은 방향에서 내가 탄 뒤에 타는 분 모두에게 요청과 푸시를 보낸다.
 * 결과(자리 있음·없음)와 상관없이 하루 1회 크레딧을 적립한다.
 */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    // 방향 여정: go(등록한 탑승역→하차역) 또는 back(반대 방향). 비어 있으면 go.
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const trip = b.trip === "back" ? "back" : "go";
    // 지하철 화면에서 오늘 바꾼 노선·역(없으면 등록 정보)
    const ride = parseTodayRide(b.today);
    const r = await callAll(uid, trip, ride);
    if (!r.ok) return json({ error: r.error }, 400);
    await Promise.all(
      r.sent.map((x) => seatPush(x.toUser, "자리 양보 가능 알림", `${x.stops}정거장 뒤 내리는 분이 자리를 양보할 수 있어요. 수락하면 대화할 수 있어요.`, "seat-call"))
    );
    // 하루 1회(같은 날 두 번째부터는 0). 자리 유무와 무관하다.
    const credit = await grant(uid, "sit").catch(() => 0);
    // 이어서 '내 자리'에 앉은 좌석을 남기면 받을 수 있는 크레딧(오늘 이미 받았으면 0)
    const spotBonus = await (async () => {
      const amount = (await getRules()).spot;
      if (!amount) return 0;
      const done = await db()`select 1 from credit_ledger where user_id = ${uid} and reason = 'spot' and day = ${kstDay()} limit 1`;
      return done.length ? 0 : amount;
    })().catch(() => 0);
    // 하차 알림(내릴 역 바로 전 역에서 한 번, 2026-11-13)
    const plan = await todayPlan(uid, trip, ride).catch(() => null);
    const alight = plan ? await setupAlightAlert(uid, { line: plan.boardLine, board: plan.boardStation, alight: plan.alightStation, next: plan.boardNext }).catch(() => null) : null;
    return json({ sent: r.sent.length, credit, spotBonus, alight });
  } catch (e) {
    return fail(e);
  }
}
