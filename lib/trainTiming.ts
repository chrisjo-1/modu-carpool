/**
 * 열차별 앉을 확률(2026-11-12 사용자 지시): 내 방향으로 들어오는 열차의 도착 시각과 앞차와의 간격으로
 * 칸 안내 1순위 칸-문의 앉을 확률을 열차마다 다시 계산한다. 순수 함수(서버·화면·테스트 공용).
 *
 * 생각: 앞차에 바짝 붙어오는 열차는 그 사이 승강장에 모인 사람이 적어 덜 붐빈다.
 * 간격이 평소(관측한 간격의 가운데 값, 모르면 5분)보다 짧으면 확률을 올리고, 길면 낮춘다.
 */

/** 정거장 하나 지나는 데 걸리는 시간(초). 앱 다른 곳과 같은 2분. */
export const STOP_SEC = 120;
/** 이보다 빨리 들어오는 열차는 추천하지 않는다(추천 칸-문까지 걸어갈 시간, 2분). */
export const MIN_LEAD_SEC = 120;
const DEFAULT_GAP = 300;

/**
 * 도착까지 남은 초. 실시간 값(sec)이 있으면 그것, 없으면 상태 코드·문구·떨어진 정거장 수로 어림한다.
 * 막 출발한 열차는 음수.
 */
export function etaOf(a: { code: number; sec: number; msg: string; stopsAway?: number | null }): number | null {
  if (a.sec > 0) return a.sec;
  switch (a.code) {
    case 2: return -30; // 출발
    case 1: return 0; // 도착
    case 0: return 30; // 진입
    case 5: return 100; // 전역 도착
    case 4: return 150; // 전역 진입
    case 3: return 90; // 전역 출발
  }
  const m = a.msg.match(/(\d+)\s*분(?:\s*(\d+)\s*초)?/);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  const n = a.msg.match(/\[(\d+)\]\s*번째/);
  if (n) return Number(n[1]) * STOP_SEC;
  if (a.stopsAway != null && a.stopsAway >= 0) return a.stopsAway * STOP_SEC;
  return null;
}

export type TimedTrain = { trainNo: string; terminal: string; eta: number; express: boolean; last: boolean };
export type TrainChance = TimedTrain & {
  /** 앞차와 간격(초), 모르면 null */
  gap: number | null;
  /** 1순위 칸-문의 이 열차 앉을 확률(0~1) */
  prob: number;
  /** 몇 번째로 들어오는 열차인지(1부터) */
  order: number;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

/**
 * 들어오는 열차 최대 n대의 간격·확률과 추천 열차.
 * base = 칸 안내 1순위 칸-문의 앉을 확률(0~1).
 */
export function planTrains(trains: TimedTrain[], base: number, n = 3): { list: TrainChance[]; best: TrainChance | null; typicalGap: number } {
  const sorted = [...trains].sort((a, b) => a.eta - b.eta);
  const gaps: (number | null)[] = sorted.map((t, i) => (i === 0 ? null : Math.max(0, t.eta - sorted[i - 1].eta)));
  const known = gaps.filter((g): g is number => g != null && g > 0);
  const typicalGap = median(known) ?? DEFAULT_GAP;
  const list: TrainChance[] = [];
  sorted.forEach((t, i) => {
    if (t.eta < 0 || list.length >= n) return;
    const gap = gaps[i];
    const adj = gap == null ? 1 : 1 + 0.6 * ((typicalGap - gap) / typicalGap);
    const prob = Math.min(0.95, Math.max(0.03, base * Math.min(1.5, Math.max(0.5, adj))));
    list.push({ ...t, gap, prob: Math.round(prob * 100) / 100, order: list.length + 1 });
  });
  const pool = list.filter((t) => t.eta >= MIN_LEAD_SEC);
  const best = pool.reduce<TrainChance | null>((b, t) => (!b || t.prob > b.prob + 0.001 ? t : b), null);
  return { list, best, typicalGap };
}

/** "5분 뒤", "곧 도착", "막 출발" */
export function etaLabel(eta: number): string {
  if (eta < 0) return "막 출발";
  if (eta < 60) return "곧 도착";
  return `${Math.round(eta / 60)}분 뒤`;
}
