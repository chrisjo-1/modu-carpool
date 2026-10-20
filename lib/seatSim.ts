/**
 * 앉아가기 시뮬레이션(순수 함수, DB와 무관).
 * 가상 회원을 시드 난수로 만들고, 실제 매칭 규칙(seatPair)을 그대로 돌려 쌍을 센다.
 * 실제 회원 데이터는 읽지도 쓰지도 않는다.
 */
import { carNumbersOf, LINE_STATIONS, type LineId } from "./subway";
import { headingsAt, routePathVia } from "./subwayRoute";
import { seatPair, toMinutes, type SeatPlanRow } from "./seatMatch";

/** 구분: go = 출근, back = 퇴근. 출근과 퇴근은 서로 짝을 짓지 않는다. */
export type RideKind = "go" | "back";
export type SimOptions = { line: LineId; count: number; seed: number; from: string; to: string; kind?: RideKind };
export type SimUser = SeatPlanRow & { ride: RideKind };
/** 기본 시간대: 출근 아침, 퇴근 저녁 */
export const DEFAULT_WINDOW: Record<RideKind, [string, string]> = { go: ["07:00", "09:00"], back: ["18:00", "20:00"] };

/** 시드 난수(mulberry32). 같은 시드면 같은 가상 회원이 나온다. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_SETS = ["12345", "1234567", "135", "24", "0246"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * 가상 회원 만들기. 탑승역에서 방면(다음 역)을 고르고, 그 방면으로 2~12정거장 떨어진 하차역을 고른다.
 * 경로는 routePathVia로 만들므로 방면과 경로가 항상 맞는다.
 */
export function makeUsers(o: SimOptions): SimUser[] {
  const r = rng(o.seed);
  const st = LINE_STATIONS[o.line] ?? [];
  const fromM = toMinutes(o.from) ?? 420;
  const toM = toMinutes(o.to) ?? 540;
  const cars = carNumbersOf(o.line);
  const users: SimUser[] = [];
  const ride: RideKind = o.kind ?? "go";
  let guard = 0;
  while (users.length < o.count && st.length > 1 && guard++ < o.count * 200) {
    const board = st[Math.floor(r() * st.length)];
    const hs = headingsAt(o.line, board);
    if (hs.length === 0) continue;
    const h = hs[Math.floor(r() * hs.length)];
    const alight = st[Math.floor(r() * st.length)];
    if (alight === board) continue;
    const path = routePathVia(o.line, board, alight, h.next);
    if (!path || path.length - 1 < 2 || path.length - 1 > 12) continue;
    const n = users.length + 1;
    users.push({
      id: n,
      userId: `v${n}`,
      days: DAY_SETS[Math.floor(r() * DAY_SETS.length)],
      boardLine: o.line,
      boardStation: board,
      alightLine: o.line,
      alightStation: alight,
      timeGo: hhmm(fromM + Math.floor(r() * (toM - fromM + 1))),
      boardCar: cars[Math.floor(r() * cars.length)],
      boardGate: String(1 + Math.floor(r() * 4)),
      back: false,
      timeBack: "",
      backCar: "",
      backGate: "",
      boardNext: h.next,
      backNext: "",
      ride,
    });
  }
  return users;
}

export type SimMatch = {
  taker: number;
  giver: number;
  stops: number;
  seatStation: string;
  meetStation: string;
  gapMin: number;
  car: string;
  gate: string;
};

/** 모든 (받는 사람, 주는 사람) 쌍에 매칭 규칙을 돌려 결과를 집계한다. */
export function runSim(users: SimUser[]) {
  const matches: SimMatch[] = [];
  for (const a of users) {
    for (const b of users) {
      if (a === b) continue;
      const p = seatPair(a, b);
      if (p) matches.push({ taker: a.id, giver: b.id, ...p });
    }
  }
  const takers = new Set(matches.map((m) => m.taker));
  const byStops = [1, 2, 3].map((s) => matches.filter((m) => m.stops === s).length);
  const avgGap = matches.length ? Math.round((matches.reduce((x, m) => x + m.gapMin, 0) / matches.length) * 10) / 10 : 0;
  matches.sort((x, y) => x.stops - y.stops || x.gapMin - y.gapMin || x.taker - y.taker);

  // 회원별: 내가 받을 수 있는 상대(take)와 내가 줄 수 있는 상대(give), 가장 가까운 상대
  const perUser = users.map((u) => {
    const mine = matches.filter((m) => m.taker === u.id || m.giver === u.id);
    const take = mine.filter((m) => m.taker === u.id);
    const give = mine.filter((m) => m.giver === u.id);
    const best = [...mine].sort((x, y) => x.stops - y.stops || x.gapMin - y.gapMin)[0];
    return {
      id: u.id,
      takeCount: take.length,
      giveCount: give.length,
      best: best
        ? { role: best.taker === u.id ? "take" : "give", with: best.taker === u.id ? best.giver : best.taker, stops: best.stops, gapMin: best.gapMin }
        : null,
    };
  });

  return {
    summary: {
      users: users.length,
      pairsTested: users.length * Math.max(users.length - 1, 0),
      matches: matches.length,
      takers: takers.size,
      unmatched: users.length - takers.size,
      byStops,
      avgGap,
    },
    matches,
    perUser,
  };
}
