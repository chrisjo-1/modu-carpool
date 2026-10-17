/**
 * 지하철 앉아가기 매칭 규칙(순수 함수, DB와 무관).
 * - 같은 탑승역·하차역(노선 포함)이어야 한다.
 * - 요일이 하나라도 겹쳐야 한다.
 * - 출근 탑승 시각 차이가 30분 이내여야 한다.
 * - 같은 탑승 칸이면 앞쪽에 보여 준다.
 */

export const TIME_WINDOW_MIN = 30;

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
};

export type Candidate = SeatPlanRow & { sameCar: boolean; gapMin: number };

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

/** 나와 매칭될 수 있는 상대를 골라 정렬한다. 같은 칸 우선, 그다음 시각 차이가 작은 순. */
export function rankCandidates(me: SeatPlanRow, others: SeatPlanRow[]): Candidate[] {
  const my = toMinutes(me.timeGo);
  if (my === null) return [];
  const out: Candidate[] = [];
  for (const o of others) {
    if (o.userId === me.userId) continue;
    if (o.boardLine !== me.boardLine || o.boardStation !== me.boardStation) continue;
    if (o.alightLine !== me.alightLine || o.alightStation !== me.alightStation) continue;
    if (!daysOverlap(me.days, o.days)) continue;
    const t = toMinutes(o.timeGo);
    if (t === null) continue;
    const gap = Math.abs(t - my);
    if (gap > TIME_WINDOW_MIN) continue;
    out.push({ ...o, sameCar: o.boardCar === me.boardCar, gapMin: gap });
  }
  return out.sort((x, y) => Number(y.sameCar) - Number(x.sameCar) || x.gapMin - y.gapMin || x.id - y.id);
}
