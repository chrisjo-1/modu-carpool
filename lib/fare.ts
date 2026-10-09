/**
 * 예상 요금 계산 (서울 기준, 2026년 확인 값)
 * - 중형택시: 기본 1.6km 4,800원, 이후 131m(또는 30초)당 100원.
 *   심야 22~23시·02~04시 20%(기본 5,800원, 단위 120원), 23~02시 40%(기본 6,700원, 단위 140원)
 * - 수도권 지하철·버스(교통카드): 기본 1,550원, 10km 초과 5km마다 100원, 50km 초과 8km마다 100원
 */
export type FareEstimate = {
  km: number;
  min: number;
  taxi: { low: number; high: number; night: 0 | 20 | 40 };
  transit: number | null;
};

const round100 = (n: number) => Math.round(n / 100) * 100;

/** 출발 시각(ms)의 한국 시각 기준 심야할증 */
export function nightRate(at: number): 0 | 20 | 40 {
  const h = new Date(at + 9 * 3600_000).getUTCHours();
  if (h === 23 || h < 2) return 40;
  if (h === 22 || (h >= 2 && h < 4)) return 20;
  return 0;
}

export function taxiFare(meters: number, seconds: number, at: number) {
  const night = nightRate(at);
  const base = night === 40 ? 6700 : night === 20 ? 5800 : 4800;
  const unit = night === 40 ? 140 : night === 20 ? 120 : 100;
  const distance = base + Math.max(0, Math.ceil((meters - 1600) / 131)) * unit;
  // 막히는 구간(시속 15.72km 미만)은 30초당 요금이 더 붙는다. 이동 시간의 30%가 정체라고 보고 위쪽 값을 잡는다.
  const jam = Math.ceil((seconds * 0.3) / 30) * unit;
  return { low: round100(distance), high: round100(distance + jam), night };
}

export function transitFare(km: number): number | null {
  if (km > 120) return null; // 장거리는 고속·시외버스 요금이라 계산하지 않는다.
  let fare = 1550;
  if (km > 10) fare += Math.ceil((Math.min(km, 50) - 10) / 5) * 100;
  if (km > 50) fare += Math.ceil((km - 50) / 8) * 100;
  return fare;
}

export function estimate(meters: number, seconds: number, at: number): FareEstimate {
  const km = meters / 1000;
  return { km: Math.round(km * 10) / 10, min: Math.max(1, Math.round(seconds / 60)), taxi: taxiFare(meters, seconds, at), transit: transitFare(km) };
}
