import { currentUserId, fail, json, needLogin, text } from "@/lib/server";
import { getMyPlan, ridePartners, seatDbReady } from "@/lib/seatDb";
import { seatPush } from "@/lib/seatNotify";
import { LINE_STATIONS } from "@/lib/subway";

export const dynamic = "force-dynamic";

/**
 * 이동 중 현재역 알리기: 지금 지나는 역을 골라 대기·수락된 상대 모두에게 푸시를 다시 보낸다.
 * 요청을 새로 만들지 않으며, 횟수 제한은 없다.
 */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  let station = "";
  try {
    const b = (await req.json()) as Record<string, unknown>;
    station = text(b.station, 20);
  } catch {
    return json({ error: "현재역을 골라 주세요." }, 400);
  }
  try {
    const plan = await getMyPlan(uid);
    if (!plan) return json({ error: "먼저 지하철 출퇴근 정보를 등록해 주세요." }, 400);
    const stations = LINE_STATIONS[plan.boardLine] ?? [];
    if (!station || !stations.includes(station)) return json({ error: "현재역을 목록에서 골라 주세요." }, 400);
    const partners = await ridePartners(uid);
    await Promise.all(partners.map((p) => seatPush(p, "지금 지나는 역 알림", `지금 ${station}역을 지나고 있어요.`, "seat-ride")));
    return json({ sent: partners.length, station });
  } catch (e) {
    return fail(e);
  }
}
