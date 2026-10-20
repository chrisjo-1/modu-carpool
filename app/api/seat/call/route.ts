import { body, currentUserId, fail, json, needLogin } from "@/lib/server";
import { callAll, seatDbReady } from "@/lib/seatDb";
import { seatPush } from "@/lib/seatNotify";

export const dynamic = "force-dynamic";

/**
 * 지하철 CALL: 1~3정거장 안에서 자리를 나눌 수 있는 상대 모두에게 요청과 푸시를 보낸다.
 * 희망(내가 받음)·양보(내가 줌)는 등록 정보로 자동 판단한다. 횟수 제한·크레딧 차감 없음.
 */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  const b = await body(req);
  // 앉아 있으면 양보(sit), 서 있으면 희망(stand)만 보낸다.
  const posture = b.posture === "sit" || b.posture === "stand" ? b.posture : "";
  try {
    const r = await callAll(uid, posture);
    if (!r.ok) return json({ error: r.error }, 400);
    await Promise.all(
      r.sent.map((s) =>
        // 받는 사람 입장에서: 내가 자리를 받는 쪽이면 상대는 양보 요청을 받은 것이다.
        s.role === "take"
          ? seatPush(s.toUser, "자리 희망 요청이 왔어요", `${s.stops}정거장 뒤 내리시는 자리를 원하는 분이 있어요. 수락하면 대화할 수 있어요.`, "seat-call")
          : seatPush(s.toUser, "자리 양보 요청이 왔어요", `${s.stops}정거장 뒤 자리를 양보하실 분이 있어요. 수락하면 대화할 수 있어요.`, "seat-call")
      )
    );
    return json({ sent: r.sent.length });
  } catch (e) {
    return fail(e);
  }
}
