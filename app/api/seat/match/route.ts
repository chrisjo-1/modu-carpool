import { currentUserId, db, fail, json, needLogin } from "@/lib/server";
import { getMyPlan, listAhead, listCandidates, seatDbReady } from "@/lib/seatDb";
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
    name: names.get(c.userId) || "",
  }));
}

/**
 * 나와 자리를 나눌 수 있는 등록 목록. 기본은 자동 매칭(출근, 1~3정거장).
 * ?ahead=1 이면 같은 노선·같은 방향에서 내가 탄 뒤에 타는 분들의 목록을 준다.
 */
export async function GET(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  const ahead = new URL(req.url).searchParams.get("ahead") === "1";
  try {
    const me = await getMyPlan(uid);
    if (!me) return json({ candidates: [], needPlan: true });
    const list = ahead ? await listAhead(me) : await listCandidates(me);
    return json({ needPlan: false, candidates: await view(list) });
  } catch (e) {
    return fail(e);
  }
}
