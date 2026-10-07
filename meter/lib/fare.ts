import type { Preset } from "./config";

/** 해당 시각(기기 현지 시간)의 심야 할증률. 없으면 0. */
export function nightRate(p: Preset, date: Date): number {
  const h = date.getHours();
  for (const r of p.night) {
    const hit = r.from < r.to ? h >= r.from && h < r.to : h >= r.from || h < r.to;
    if (hit) return r.rate;
  }
  return 0;
}

/**
 * 환산거리(eq, m)를 기준으로 요금을 계산한다.
 * 환산거리 = 정상 주행 구간의 실제 거리 + 저속 구간의 시간을 거리로 바꾼 값.
 */
export function calcFare(p: Preset, eq: number, surcharge: number): number {
  const over = Math.max(0, eq - p.baseDist);
  const units = Math.floor(over / p.unitDist);
  const raw = (p.base + units * p.unitFare) * (1 + surcharge);
  return Math.round(raw / 100) * 100;
}

/** 다음 요금 인상까지 남은 환산거리(m)와 현재 구간 길이(m). */
export function nextStep(p: Preset, eq: number): { remain: number; span: number } {
  if (eq < p.baseDist) return { remain: p.baseDist - eq, span: p.baseDist };
  const into = (eq - p.baseDist) % p.unitDist;
  return { remain: p.unitDist - into, span: p.unitDist };
}

/** 저속(정체·정차) 구간의 경과 시간을 환산거리로 바꾼다. */
export function slowEq(p: Preset, seconds: number): number {
  return (seconds * p.unitDist) / p.unitSec;
}

export function perPerson(total: number, passengers: number, includeDriver: boolean): number {
  const n = Math.max(1, passengers + (includeDriver ? 1 : 0));
  return Math.round(total / n / 10) * 10;
}

/** 두 좌표 사이 거리(m). */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const won = (n: number) => n.toLocaleString("ko-KR");
