import { ALL_LINES, carCountOf } from "./subway";

/**
 * 앉을 확률 높은 탑승 칸·입구 안내의 계산 규칙(순수 함수, DB 없음).
 *
 * - 기준 키: 노선·역·방향·요일(0~6, 출퇴근 요일과 같은 숫자)·30분 시간대.
 * - 데이터: 지금은 회원이 남긴 착석 기록(자체 분석)만 쓴다. 공공 혼잡도 데이터가 붙으면
 *   같은 형식의 행을 추가로 넣으면 된다.
 * - 표본이 기준(MIN_SAMPLE)보다 적으면 추천하지 않고 "데이터 수집 중"으로 둔다.
 * - 칸·입구 조합은 착석률을 평활(사전 확률 0.5, 가중 PRIOR_WEIGHT)해서 본다.
 *   표본이 적은 조합은 높은 확률이 나오지 않도록 최소 건수(MIN_PAIR) 미만이면 순위에서 뺀다.
 */

export const MIN_SAMPLE = 30;
export const MIN_PAIR = 5;
const PRIOR_RATE = 0.5;
const PRIOR_WEIGHT = 4;

export type Level = "high" | "mid" | "low";
export const LEVEL_LABEL: Record<Level, string> = { high: "가능성 높음", mid: "보통", low: "낮음" };

export type FeedbackRow = { car: string; entrance: string; seated: boolean };

export type CarRank = {
  car: string;
  entrance: string;
  /** 평활된 착석률(0~1) */
  rate: number;
  /** 이 조합의 기록 건수 */
  n: number;
  /** 이 조합의 착석 건수 */
  seated: number;
  level: Level;
  label: string;
};

export type GuideResult = {
  status: "ready" | "collecting";
  /** 이 키(노선·역·방향·요일·시간대)에 쌓인 전체 기록 건수 */
  total: number;
  ranked: CarRank[];
};

export type GuideKey = { line: string; station: string; dir: "up" | "down"; dow: string; slot: string };

export function levelOf(rate: number): Level {
  if (rate >= 0.6) return "high";
  if (rate >= 0.4) return "mid";
  return "low";
}

/** 출발 시각을 30분 단위 시간대로 줄인다(예: 07:45 → 07:30). */
export function slotOf(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${min >= 30 ? "30" : "00"}`;
}

/** 착석 기록들로 칸·입구 순위를 계산한다. */
export function rankEntrances(rows: FeedbackRow[], top = 3): GuideResult {
  const total = rows.length;
  if (total < MIN_SAMPLE) return { status: "collecting", total, ranked: [] };

  const groups = new Map<string, { car: string; entrance: string; n: number; seated: number }>();
  for (const r of rows) {
    const key = `${r.car}|${r.entrance}`;
    const g = groups.get(key) ?? { car: r.car, entrance: r.entrance, n: 0, seated: 0 };
    g.n += 1;
    if (r.seated) g.seated += 1;
    groups.set(key, g);
  }

  const ranked: CarRank[] = [...groups.values()]
    .filter((g) => g.n >= MIN_PAIR)
    .map((g) => {
      const raw = (g.seated + PRIOR_WEIGHT * PRIOR_RATE) / (g.n + PRIOR_WEIGHT);
      const level = levelOf(raw);
      return {
        car: g.car,
        entrance: g.entrance,
        rate: Math.round(raw * 100) / 100,
        n: g.n,
        seated: g.seated,
        level,
        label: LEVEL_LABEL[level],
      };
    })
    .sort((a, b) => b.rate - a.rate || b.n - a.n || Number(a.car) - Number(b.car) || a.entrance.localeCompare(b.entrance));

  return { status: "ready", total, ranked: ranked.slice(0, top) };
}

const LINE_IDS = new Set(ALL_LINES.map((l) => l.id));

/** 요청 값을 검사한다. 조회와 저장이 같은 규칙을 쓴다. */
export function parseKey(q: Record<string, string | null | undefined>): { ok: true; key: GuideKey } | { ok: false; error: string } {
  const line = String(q.line ?? "");
  const station = String(q.station ?? "").trim();
  const dir = String(q.dir ?? "");
  const dow = String(q.dow ?? "");
  const slot = String(q.slot ?? "");
  if (!LINE_IDS.has(line)) return { ok: false, error: "노선을 다시 골라 주세요." };
  if (!station || station.length > 30) return { ok: false, error: "역을 골라 주세요." };
  if (dir !== "up" && dir !== "down") return { ok: false, error: "상행·하행을 골라 주세요." };
  if (!/^[0-6]$/.test(dow)) return { ok: false, error: "요일을 골라 주세요." };
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(slot)) return { ok: false, error: "시간대가 올바르지 않아요." };
  return { ok: true, key: { line, station, dir, dow, slot } };
}

export function parseFeedback(b: Record<string, unknown>): { ok: true; key: GuideKey; car: string; entrance: string; seated: boolean } | { ok: false; error: string } {
  const key = parseKey({
    line: typeof b.line === "string" ? b.line : "",
    station: typeof b.station === "string" ? b.station : "",
    dir: typeof b.dir === "string" ? b.dir : "",
    dow: typeof b.dow === "string" ? b.dow : "",
    slot: typeof b.slot === "string" ? b.slot : "",
  });
  if (key.ok === false) return { ok: false, error: key.error };
  const car = typeof b.car === "string" ? b.car : "";
  const entrance = typeof b.entrance === "string" ? b.entrance.trim() : "";
  const maxCar = carCountOf(key.key.line);
  if (!/^\d{1,2}$/.test(car) || Number(car) < 1 || Number(car) > maxCar) return { ok: false, error: "칸 번호를 골라 주세요." };
  // 입구 = 승강장 바닥 표시의 문 번호(1~4). 칸과 합쳐 "칸-문"(예: 6-1)이 된다.
  if (!/^[1-4]$/.test(entrance)) return { ok: false, error: "문 번호(1~4)를 골라 주세요." };
  if (typeof b.seated !== "boolean") return { ok: false, error: "앉았는지 골라 주세요." };
  return { ok: true, key: key.key, car, entrance, seated: b.seated };
}

/**
 * 기록이 모자라도 바로 보여 주는 "현재 기준 추정".
 * - 바탕: 혼잡도(%)로 탑승 직후 앉을 확률. 좌석이 다 차는 수준(약 34~38%)을 반으로 보는 로지스틱 곡선.
 *   혼잡도 자료가 없으면 0.4.
 * - 칸 위치: 맨 앞·맨 뒤 칸 1.2배, 그 옆 칸 1.08배, 나머지 0.95배(끝 칸이 덜 붐비는 경향).
 * - 기록: 칸마다 (착석 + W×추정) / (기록 + W), W = 8. 기록이 쌓일수록 기록 비중이 커진다.
 */
export type CarEstimate = { car: string; prob: number; n: number };
export type Estimate = { overall: number; cars: CarEstimate[]; records: number; basis: "congestion" | "default" };

const EST_WEIGHT = 8;

export function seatChance(pct: number | null): number {
  if (pct == null || !Number.isFinite(pct)) return 0.4;
  const p = 1 / (1 + Math.exp((pct - 38) / 10));
  return Math.min(0.9, Math.max(0.05, p));
}

export function carFactor(car: number, count: number): number {
  const d = Math.min(car - 1, count - car);
  return d === 0 ? 1.2 : d === 1 ? 1.08 : 0.95;
}

export function estimateCars(carCount: number, pct: number | null, rows: FeedbackRow[], top = 3): Estimate {
  const base = seatChance(pct);
  const byCar = new Map<string, { n: number; s: number }>();
  for (const r of rows) {
    const g = byCar.get(r.car) ?? { n: 0, s: 0 };
    g.n += 1;
    if (r.seated) g.s += 1;
    byCar.set(r.car, g);
  }
  const cars: CarEstimate[] = [];
  for (let i = 1; i <= carCount; i++) {
    const prior = Math.min(0.95, Math.max(0.03, base * carFactor(i, carCount)));
    const g = byCar.get(String(i)) ?? { n: 0, s: 0 };
    const prob = (g.s + EST_WEIGHT * prior) / (g.n + EST_WEIGHT);
    cars.push({ car: String(i), prob: Math.round(prob * 100) / 100, n: g.n });
  }
  cars.sort((a, b) => b.prob - a.prob || b.n - a.n || Number(a.car) - Number(b.car));
  return { overall: Math.round(base * 100) / 100, cars: cars.slice(0, top), records: rows.length, basis: pct == null ? "default" : "congestion" };
}
