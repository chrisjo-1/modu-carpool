import { currentUserId, fail, json, needLogin } from "@/lib/server";
import { getMyPlan, listCandidates, seatDbReady } from "@/lib/seatDb";

export const dynamic = "force-dynamic";

/** 나와 자리를 나눌 수 있는 등록 목록(출근, 1~3정거장). 정거장 수가 적은 순. */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    const me = await getMyPlan(uid);
    if (!me) return json({ candidates: [], needPlan: true });
    const list = await listCandidates(me);
    return json({
      needPlan: false,
      // 상대 회원 번호는 주지 않는다. 수락 전이라 정거장 수·타는 역·시각만 준다.
      candidates: list.map((c) => ({
        planId: c.id,
        role: c.role,
        stops: c.stops,
        // 하차역·자리 위치는 수락 뒤에만 보여 준다.
        seatStation: "",
        meetStation: c.meetStation,
        timeGo: c.timeGo,
        car: "",
        gate: "",
        gapMin: c.gapMin,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
