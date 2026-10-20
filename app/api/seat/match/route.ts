import { currentUserId, db, fail, json, needLogin } from "@/lib/server";
import { getMyPlan, listAhead, listBefore, listCandidates, parseTodayRide, seatDbReady, todayPlan } from "@/lib/seatDb";
import type { Candidate } from "@/lib/seatMatch";

export const dynamic = "force-dynamic";

/** 상대 목록 한 줄. 회원 번호·사진은 주지 않는다. 수락 전이라 정거장 수·타는 역·시각만 준다. */
async function view(list: Candidate[]) {
  const ids = [...new Set(list.map((c) => c.userId))];
  const names = new Map<string, string>();
  if (ids.length) {
    const rows = await db()`select id, name from users where id = any(${ids}::uuid[])`;
    for (const r of rows) names.set(String(r.id), String(r.name || ""));
  }
  return list.map((c) => ({
    planId: c.id,
    role: c.role,
    stops: c.stops,
    seatStation: "",
    meetStation: c.meetStation,
    timeGo: c.timeGo,
    car: "",
    gate: "",
    gapMin: c.gapMin,
    trip: c.trip === "back" ? "back" : "go",
    name: names.get(c.userId) || "",
  }));
}

/**
 * 같은 노선 상대 목록. 오늘 요일 기준.
 * ?list=ahead  : 내가 탄 뒤에 타는 분(앉았을 때 자리를 드릴 상대)
 * ?list=before : 내가 타고 있는 동안 자리를 비우는 분(서 있을 때 양보를 부탁할 상대)
 * 기본(auto)   : 자동 매칭(1~3정거장, 시각 차이 10분 이내)
 */
export async function GET(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  const kind = new URL(req.url).searchParams.get("list") ?? "auto";
  const sp = new URL(req.url).searchParams;
  const trip = sp.get("trip") === "back" ? "back" : "go";
  const ride = parseTodayRide({ line: sp.get("line"), board: sp.get("board"), alight: sp.get("alight"), next: sp.get("next") });
  try {
    const mine = await getMyPlan(uid);
    if (!mine) return json({ candidates: [], needPlan: true });
    const me = await todayPlan(uid, trip, ride);
    // 그 방향 정보가 없으면 빈 목록(요일은 내 쪽에서 따지지 않는다).
    if (!me) return json({ candidates: [], needPlan: false, offDay: false });
    const list = kind === "before" ? await listBefore(me) : kind === "ahead" ? await listAhead(me) : await listCandidates(me);
    return json({ needPlan: false, offDay: false, candidates: await view(list) });
  } catch (e) {
    return fail(e);
  }
}
