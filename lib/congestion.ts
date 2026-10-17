// 시간대별 혼잡도 조회. 서버에서만 쓴다(자료 JSON을 클라이언트 번들에 넣지 않는다).
import data from "./data/congestion-2026-06.json";

type Raw = {
  source: string;
  period: string;
  firstSlot: string;
  slotCount: number;
  rows: Record<string, [number[], number[], number[]]>; // [평일, 토요일, 일요일] × 시간대 39칸
};
const RAW = data as unknown as Raw;

export type CongestionLevel = "low" | "mid" | "high" | "over";
export type Congestion = { pct: number; level: CongestionLevel; label: string; source: string; period: string };

// 방향: 자료의 상선·내선 → up, 하선·외선 → down (scripts/build-congestion.py).
// 2호선은 내선·외선으로 적혀 있어 상행·하행과 1:1로 맞는지 확인이 필요하다.

/** 같은 역을 자료에서 다른 이름으로 적은 경우. 신촌(지하)는 신촌과 같은 역이다. */
const ALIASES: Record<string, string[]> = {
  신촌: ["신촌(지하)"],
  강동: ["강동(마천)", "강동(하남검단산)"],
};

export const LEVEL_TEXT: Record<CongestionLevel, string> = { low: "여유", mid: "보통", high: "혼잡", over: "매우 혼잡" };

export function levelOf(pct: number): CongestionLevel {
  if (pct >= 100) return "over";
  if (pct >= 60) return "high";
  if (pct >= 30) return "mid";
  return "low";
}

/** "HH:MM" 시간대 시작 → 자료 열 번호. 자료 범위 밖이거나 30분 단위가 아니면 -1. */
export function slotIndex(slot: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(slot);
  const first = /^(\d{2}):(\d{2})$/.exec(RAW.firstSlot);
  if (!m || !first) return -1;
  const diff = Number(m[1]) * 60 + Number(m[2]) - (Number(first[1]) * 60 + Number(first[2]));
  if (diff < 0 || diff % 30 !== 0) return -1;
  const i = diff / 30;
  return i < RAW.slotCount ? i : -1;
}

/** 요일 0(일)·6(토)은 각각 일요일·토요일 열을, 나머지는 평일 열을 쓴다. */
function dayIndex(dow: string): number {
  if (dow === "0") return 2;
  if (dow === "6") return 1;
  return 0;
}

export function lookupCongestion(line: string, station: string, dir: "up" | "down", dow: string, slot: string): Congestion | null {
  const idx = slotIndex(slot);
  if (idx < 0) return null;
  for (const name of [station, ...(ALIASES[station] ?? [])]) {
    const row = RAW.rows[`${line}|${name}|${dir}`];
    if (!row) continue;
    const pct = row[dayIndex(dow)][idx];
    const level = levelOf(pct);
    return { pct, level, label: LEVEL_TEXT[level], source: RAW.source, period: RAW.period };
  }
  return null;
}
