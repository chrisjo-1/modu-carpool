import { currentUserId, fail, json, needLogin } from "@/lib/server";
import { callAll, seatDbReady } from "@/lib/seatDb";
import { seatPush } from "@/lib/seatNotify";
import { grant } from "@/lib/credits";

export const dynamic = "force-dynamic";

/**
 * 지하철 '앉았어요': 같은 노선·같은 방향에서 내가 탄 뒤에 타는 분 모두에게 요청과 푸시를 보낸다.
 * 결과(자리 있음·없음)와 상관없이 하루 1회 크레딧을 적립한다.
 */
export async function POST() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    const r = await callAll(uid);
    if (!r.ok) return json({ error: r.error }, 400);
    await Promise.all(
      r.sent.map((x) => seatPush(x.toUser, "자리 양보 가능 알림", `${x.stops}정거장 뒤 내리는 분이 자리를 양보할 수 있어요. 수락하면 대화할 수 있어요.`, "seat-call"))
    );
    // 하루 1회(같은 날 두 번째부터는 0). 자리 유무와 무관하다.
    const credit = await grant(uid, "sit").catch(() => 0);
    return json({ sent: r.sent.length, credit });
  } catch (e) {
    return fail(e);
  }
}
