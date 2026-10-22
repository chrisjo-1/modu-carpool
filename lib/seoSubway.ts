// 공개 안내 페이지(/subway/…)용 계산. 서버에서만 쓴다(혼잡도 자료 JSON을 클라이언트에 넣지 않음).
import { lookupCongestion, LEVEL_TEXT, levelOf, type CongestionLevel } from "./congestion";
import { estimateCars } from "./seatCar";
import { ALL_LINES, carCountOf, LINE_STATIONS, OPENABLE_LINES } from "./subway";
import { headingsAt, nextStations } from "./subwayRoute";

export const SEO_LINES = OPENABLE_LINES;
export const AM_SLOTS = ["07:00", "07:30", "08:00", "08:30", "09:00"];
export const PM_SLOTS = ["18:00", "18:30", "19:00", "19:30"];
const WEEKDAY = "1";

export const lineName = (line: string) => ALL_LINES.find((l) => l.id === line)?.name ?? `${line}호선`;
export const stationsOf = (line: string) => [...new Set(LINE_STATIONS[line] ?? [])];
export const hasStation = (line: string, station: string) => stationsOf(line).includes(station);

export type SlotPct = { slot: string; pct: number | null; level: CongestionLevel | null; label: string };
export type DirProfile = {
  next: string;
  terminal: string | null;
  dir: "up" | "down";
  ahead: string[];
  am: SlotPct[];
  pm: SlotPct[];
  peak: SlotPct | null;
  cars: { car: string; prob: number }[];
  basis: "congestion" | "default";
};

const slotPct = (line: string, station: string, dir: "up" | "down", slot: string): SlotPct => {
  const c = lookupCongestion(line, station, dir, WEEKDAY, slot);
  return { slot, pct: c ? c.pct : null, level: c ? c.level : null, label: c ? c.label : "" };
};

/** 한 역의 방향별 평일 출퇴근 혼잡도와 추천 칸(출근 8시 기준). */
export function stationProfile(line: string, station: string): DirProfile[] {
  return headingsAt(line, station).map((h) => {
    const am = AM_SLOTS.map((s) => slotPct(line, station, h.dir, s));
    const pm = PM_SLOTS.map((s) => slotPct(line, station, h.dir, s));
    const all = [...am, ...pm].filter((x) => x.pct != null);
    const peak = all.length ? all.reduce((a, b) => ((b.pct ?? 0) > (a.pct ?? 0) ? b : a)) : null;
    const at8 = am.find((x) => x.slot === "08:00")?.pct ?? null;
    const est = estimateCars(carCountOf(line), at8, []);
    return { next: h.next, terminal: h.terminal, dir: h.dir, ahead: nextStations(line, station, h.next, 3), am, pm, peak, cars: est.cars.map((c) => ({ car: c.car, prob: c.prob })), basis: est.basis };
  });
}

export const hasCongestion = (line: string) => stationsOf(line).some((s) => lookupCongestion(line, s, "up", WEEKDAY, "08:00") || lookupCongestion(line, s, "down", WEEKDAY, "08:00"));

/** 평일 출근 시간(8:00·8:30) 가장 붐비는 역·방향 순위. */
export function busiest(line: string, n = 8): { station: string; next: string; terminal: string | null; pct: number; slot: string; label: string }[] {
  const out: { station: string; next: string; terminal: string | null; pct: number; slot: string; label: string }[] = [];
  for (const st of stationsOf(line)) {
    for (const h of headingsAt(line, st)) {
      for (const slot of ["08:00", "08:30"]) {
        const c = lookupCongestion(line, st, h.dir, WEEKDAY, slot);
        if (c) out.push({ station: st, next: h.next, terminal: h.terminal, pct: c.pct, slot, label: LEVEL_TEXT[levelOf(c.pct)] });
      }
    }
  }
  out.sort((a, b) => b.pct - a.pct);
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(`${x.station}|${x.next}`) ? false : (seen.add(`${x.station}|${x.next}`), true))).slice(0, n);
}

/** 검색에 내보낼 주요 역(노선마다 출근 시간 붐비는 역 8곳). 혼잡도 자료가 없는 노선은 없음. */
export function keyStations(line: string, n = 8): string[] {
  const out: string[] = [];
  for (const b of busiest(line, 40)) if (!out.includes(b.station)) out.push(b.station);
  return out.slice(0, n);
}

export const SUBWAY_TIPS = [
  "열차가 바로 뒤따라 붙어 오면 앞차를 보내고 약 2분 기다렸다가, 뒤차를 줄 맨 앞에서 타세요.",
  "맨 끝 칸(첫째·마지막 칸)은 덜 붐비지만 노약자석과 서서 가는 공간이 많아 일반 좌석이 적어요. 끝에서 두 번째 칸이 좌석이 온전해요.",
  "환승역·큰 역 바로 전에 내리는 분 앞에 서면 자리가 빨리 나요.",
];
