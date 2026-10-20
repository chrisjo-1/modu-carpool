import { DEFAULT_PILOT_LINES, OPENABLE_LINES, type LineId } from "./subway";
import { db, ensureSchema, hasDb } from "./server";

/** 앉아가기 설정: 열기 여부와 시범 노선. 설정 테이블(settings)에 저장한다. */
export const SEAT_ENABLED_KEY = "seat_enabled";
export const SEAT_PILOT_KEY = "seat_pilot_lines";
/** 관리자가 고를 수 있는 시범 노선(역 목록·방향 자료가 있는 노선). */
export const PILOT_CHOICES: LineId[] = OPENABLE_LINES;

export type SeatConfig = { enabled: boolean; pilot: LineId[] };

export async function readSeatConfig(): Promise<SeatConfig> {
  const fallback: SeatConfig = { enabled: false, pilot: DEFAULT_PILOT_LINES };
  if (!hasDb()) return fallback;
  try {
    await ensureSchema();
    const rows = await db()`select key, value from settings where key in (${SEAT_ENABLED_KEY}, ${SEAT_PILOT_KEY})`;
    const map = new Map(rows.map((r) => [r.key as string, r.value as string]));
    let pilot = fallback.pilot;
    try {
      const parsed = JSON.parse(map.get(SEAT_PILOT_KEY) ?? "null");
      if (Array.isArray(parsed)) pilot = parsed.filter((x): x is LineId => PILOT_CHOICES.includes(x));
    } catch {
      /* 저장된 값이 깨졌으면 기본값 */
    }
    return { enabled: map.get(SEAT_ENABLED_KEY) === "1", pilot };
  } catch {
    return fallback;
  }
}
