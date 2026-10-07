export type NightRule = { from: number; to: number; rate: number };

export type Preset = {
  id: string;
  name: string;
  base: number; // 기본요금(원)
  baseDist: number; // 기본거리(m)
  unitDist: number; // 거리요금 단위(m)
  unitFare: number; // 단위당 요금(원)
  unitSec: number; // 시간요금 단위(초)
  slowKmh: number; // 이 속도 미만이면 시간요금 적용
  night: NightRule[];
};

export type AppConfig = {
  presets: Preset[];
  notice: string;
  carpoolUrl: string;
  monthlyCap: number;
};

const SEOUL_NIGHT: NightRule[] = [
  { from: 22, to: 23, rate: 0.2 },
  { from: 23, to: 2, rate: 0.4 },
  { from: 2, to: 4, rate: 0.2 },
];

export const DEFAULT_CONFIG: AppConfig = {
  presets: [
    { id: "seoul", name: "서울 중형", base: 4800, baseDist: 1600, unitDist: 131, unitFare: 100, unitSec: 30, slowKmh: 15.72, night: SEOUL_NIGHT },
    { id: "seoul-lux", name: "서울 모범·대형", base: 7000, baseDist: 3000, unitDist: 151, unitFare: 200, unitSec: 36, slowKmh: 15.1, night: SEOUL_NIGHT },
    { id: "gyeonggi", name: "경기 중형", base: 4800, baseDist: 2000, unitDist: 132, unitFare: 100, unitSec: 31, slowKmh: 15.33, night: [{ from: 23, to: 4, rate: 0.3 }] },
    { id: "incheon", name: "인천 중형", base: 4800, baseDist: 2000, unitDist: 135, unitFare: 100, unitSec: 33, slowKmh: 14.73, night: [{ from: 22, to: 4, rate: 0.2 }] },
    { id: "busan", name: "부산 중형", base: 4800, baseDist: 2000, unitDist: 132, unitFare: 100, unitSec: 33, slowKmh: 14.4, night: [{ from: 23, to: 1, rate: 0.2 }, { from: 1, to: 4, rate: 0.3 }] },
  ],
  notice: "본 서비스는 카풀 비용 분담용 참고 미터기입니다. 영리 목적의 요금 청구는 법적 처벌 대상입니다.",
  carpoolUrl: "https://modu-carpool.vercel.app",
  monthlyCap: 400000,
};

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const str = (v: unknown, max: number, fallback: string) =>
  typeof v === "string" ? v.slice(0, max) : fallback;

/** 외부(관리자 입력·DB)에서 온 설정을 안전한 값으로 정리한다. */
export function sanitizeConfig(input: unknown): AppConfig {
  const d = DEFAULT_CONFIG;
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawPresets = Array.isArray(o.presets) ? o.presets.slice(0, 12) : [];
  const presets: Preset[] = rawPresets
    .map((p, i): Preset | null => {
      if (!p || typeof p !== "object") return null;
      const r = p as Record<string, unknown>;
      const id = str(r.id, 24, "").replace(/[^a-z0-9-]/gi, "") || `p${i}`;
      const night = (Array.isArray(r.night) ? r.night.slice(0, 6) : [])
        .map((n) => {
          const x = (n ?? {}) as Record<string, unknown>;
          return { from: num(x.from, 0, 23, 0), to: num(x.to, 0, 24, 0), rate: num(x.rate, 0, 1, 0) };
        })
        .filter((n) => n.rate > 0);
      return {
        id,
        name: str(r.name, 20, "요금제") || "요금제",
        base: num(r.base, 0, 100000, 4800),
        baseDist: num(r.baseDist, 0, 20000, 1600),
        unitDist: num(r.unitDist, 10, 5000, 131),
        unitFare: num(r.unitFare, 0, 10000, 100),
        unitSec: num(r.unitSec, 5, 600, 30),
        slowKmh: num(r.slowKmh, 0, 60, 15),
        night,
      };
    })
    .filter((p): p is Preset => p !== null);
  const url = str(o.carpoolUrl, 300, "");
  return {
    presets: presets.length ? presets : d.presets,
    notice: str(o.notice, 200, d.notice) || d.notice,
    carpoolUrl: /^https:\/\/[^\s]+$/.test(url) ? url : d.carpoolUrl,
    monthlyCap: num(o.monthlyCap, 0, 10000000, d.monthlyCap),
  };
}
