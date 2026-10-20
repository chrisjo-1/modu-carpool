import { DEFAULT_WINDOW, makeUsers, runSim, type RideKind } from "@/lib/seatSim";
import { LINE_STATIONS } from "@/lib/subway";
import { body, fail, isAdmin, json } from "@/lib/server";
import { toMinutes } from "@/lib/seatMatch";

export const dynamic = "force-dynamic";

/**
 * 앉아가기 시뮬레이션(관리자 전용). 가상 회원을 만들어 매칭 규칙만 돌린다. DB에는 아무것도 쓰지 않는다.
 * 인원은 최대 300명(쌍 수 약 9만 개)까지만 계산한다. 구분(go 출근 / back 퇴근)별로 따로 짝을 짓는다.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const b = await body(req);
  const line = String(b.line ?? "2");
  if (!LINE_STATIONS[line]) return json({ error: "지원하지 않는 노선이에요." }, 400);
  const kind: RideKind = b.kind === "back" ? "back" : "go";
  const count = Math.min(Math.max(Math.round(Number(b.count) || 40), 2), 300);
  const seed = Math.round(Number(b.seed) || 1);
  const [defFrom, defTo] = DEFAULT_WINDOW[kind];
  const from = String(b.from || defFrom);
  const to = String(b.to || defTo);
  if (toMinutes(from) === null || toMinutes(to) === null || toMinutes(from)! >= toMinutes(to)!) {
    return json({ error: "시간대를 확인해 주세요(시작 < 끝)." }, 400);
  }
  try {
    const users = makeUsers({ line, count, seed, from, to, kind });
    const { summary, matches, perUser } = runSim(users);
    return json({
      kind,
      summary,
      users: users.map((u) => ({
        id: u.id,
        line: u.boardLine,
        board: u.boardStation,
        alight: u.alightStation,
        next: u.boardNext,
        time: u.timeGo,
        days: u.days,
        car: u.boardCar,
        gate: u.boardGate,
      })),
      perUser,
      matches: matches.slice(0, 500),
    });
  } catch (e) {
    return fail(e);
  }
}
