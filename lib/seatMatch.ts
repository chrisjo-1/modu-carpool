/**
 * 지하철 앉아가기 매칭 규칙(순수 함수, DB와 무관).
 *
 * 자리를 받는 사람(B)과 주는 사람(A)을 잇는다. 예: 5호선 방화 방면, B는 장한평에서 타고
 * A는 그보다 앞에서 이미 타고 있다가 다음 역 답십리에서 내린다 → 1정거장만 서 가면 된다(1순위).
 *
 * - 같은 노선, 같은 방향(경로가 겹침)이어야 한다. 지금은 출근만 본다.
 * - A는 B의 탑승역보다 앞에서 타야 한다(이미 앉아 있음).
 * - A는 B가 탄 뒤 1~MAX_STOPS 정거장 안에 내려야 하고, B는 그보다 더 멀리 가야 한다.
 * - A가 B의 탑승역을 지나는 예상 시각(역 사이 MIN_PER_STOP분)과 B의 탑승 시각 차이가 TIME_WINDOW_MIN 이내.
 * - 요일이 하나라도 겹쳐야 한다.
 * - 순위: 정거장 수가 적을수록, 그다음 시각 차이가 작을수록 앞.
 */
import { routePathVia } from "./subwayRoute";

export const MAX_STOPS = 3;
export const TIME_WINDOW_MIN = 10;
export const MIN_PER_STOP = 2;

export type SeatPlanRow = {
  id: number;
  userId: string;
  days: string;
  boardLine: string;
  boardStation: string;
  alightLine: string;
  alightStation: string;
  timeGo: string;
  boardCar: string;
  boardGate: string;
  back: boolean;
  timeBack: string;
  backCar: string;
  backGate: string;
  /** 출근 방면(다음 역). 비어 있으면 경로 기본값을 쓴다. */
  boardNext: string;
  /** 퇴근 방면(다음 역). 화면 표시용. */
  backNext: string;
};

/** 두 등록 사이의 자리 나눔 정보. */
export type SeatPair = {
  /** 받는 사람이 탄 뒤 주는 사람이 내리기까지 정거장 수(1이 1순위) */
  stops: number;
  /** 자리가 나는 역(주는 사람 하차역) */
  seatStation: string;
  /** 받는 사람이 타는 역(주는 사람이 이미 타고 지나가는 역) */
  meetStation: string;
  /** 주는 사람이 meetStation을 지나는 예상 시각과 받는 사람 탑승 시각의 차이(분) */
  gapMin: number;
  /** 만날 위치 = 주는 사람의 칸-문 */
  car: string;
  gate: string;
};

/** role: take = 내가 자리를 받음, give = 내 자리를 상대가 받음 */
export type Candidate = SeatPlanRow & SeatPair & { role: "take" | "give" };

/** "HH:MM" → 자정 기준 분. 형식이 틀리면 null */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function daysOverlap(a: string, b: string): boolean {
  return [...a].some((d) => b.includes(d));
}

/** taker가 giver의 자리를 받을 수 있으면 그 정보를, 아니면 null. */
export function seatPair(taker: SeatPlanRow, giver: SeatPlanRow): SeatPair | null {
  if (taker.userId === giver.userId) return null;
  const line = taker.boardLine;
  if (taker.alightLine !== line || giver.boardLine !== line || giver.alightLine !== line) return null;
  if (!daysOverlap(taker.days, giver.days)) return null;
  const T = routePathVia(line, taker.boardStation, taker.alightStation, taker.boardNext);
  const G = routePathVia(line, giver.boardStation, giver.alightStation, giver.boardNext);
  if (!T || !G || T.length < 2 || G.length < 2) return null;

  const i = G.indexOf(T[0]); // 주는 사람 경로에서 받는 사람 탑승역 위치
  if (i <= 0) return null; // 주는 사람이 먼저 타고 있어야 한다
  const stops = G.length - 1 - i;
  if (stops < 1 || stops > MAX_STOPS) return null;
  if (T.length - 1 <= stops) return null; // 받는 사람이 더 멀리 가야 한다
  for (let j = 0; j <= stops; j++) if (T[j] !== G[i + j]) return null; // 같은 방향·같은 길

  const g = toMinutes(giver.timeGo);
  const t = toMinutes(taker.timeGo);
  if (g === null || t === null) return null;
  const gapMin = Math.abs(g + MIN_PER_STOP * i - t);
  if (gapMin > TIME_WINDOW_MIN) return null;

  return { stops, seatStation: G[G.length - 1], meetStation: T[0], gapMin, car: giver.boardCar, gate: giver.boardGate };
}

/** 나와 매칭될 수 있는 상대를 골라 정렬한다. 내가 받는 경우와 주는 경우를 모두 본다. */
export function rankCandidates(me: SeatPlanRow, others: SeatPlanRow[]): Candidate[] {
  const out: Candidate[] = [];
  for (const o of others) {
    if (o.userId === me.userId) continue;
    const take = seatPair(me, o);
    if (take) out.push({ ...o, ...take, role: "take" });
    const give = seatPair(o, me);
    if (give) out.push({ ...o, ...give, role: "give" });
  }
  return out.sort((x, y) => x.stops - y.stops || x.gapMin - y.gapMin || x.id - y.id);
}
