import { currentUserId, fail, json, needLogin } from "@/lib/server";
import { getMyPlan, listCandidates, seatDbReady } from "@/lib/seatDb";

export const dynamic = "force-dynamic";

/** 나와 맞는 등록 목록. 상대의 회원 번호는 주지 않고 등록 번호와 시각·칸만 준다. */
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
      candidates: list.map((c) => ({ planId: c.id, timeGo: c.timeGo, boardCar: c.boardCar, boardGate: c.boardGate, sameCar: c.sameCar, gapMin: c.gapMin })),
    });
  } catch (e) {
    return fail(e);
  }
}
