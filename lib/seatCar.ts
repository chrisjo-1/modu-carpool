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
  if (!/^\d{1,2}$/.test(entrance)) return { ok: false, error: "입구 번호는 숫자로 적어 주세요." };
  if (typeof b.seated !== "boolean") return { ok: false, error: "앉았는지 골라 주세요." };
  return { ok: true, key: key.key, car, entrance, seated: b.seated };
}
