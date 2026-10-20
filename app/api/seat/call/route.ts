import { currentUserId, fail, json, needLogin } from "@/lib/server";
import { callAll, seatDbReady } from "@/lib/seatDb";
import { seatPush } from "@/lib/seatNotify";

export const dynamic = "force-dynamic";

/**
 * 지하철 PUSH(앉았을 때): 같은 노선에서 내 자리를 받을 수 있는 상대 모두에게 요청과 푸시를 보낸다.
 * 횟수 제한·크레딧 차감 없음.
 */
export async function POST() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    const r = await callAll(uid);
    if (!r.ok) return json({ error: r.error }, 400);
    // 앉은 쪽이 보낸 PUSH: 받는 분은 자리를 받을 수 있는 쪽이다.
    await Promise.all(
      r.sent.map((x) => seatPush(x.toUser, "자리 양보 가능 알림", `${x.stops}정거장 뒤 내리는 분이 자리를 양보할 수 있어요. 수락하면 대화할 수 있어요.`, "seat-call"))
    );
    return json({ sent: r.sent.length });
  } catch (e) {
    return fail(e);
  }
}
