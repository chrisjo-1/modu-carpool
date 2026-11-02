import type { Post } from "./types";
import { detourOf, km, routeMatch } from "./match";

/**
 * 회원 '내 글' 매칭(2026-11-02): 내 글 한 건과 반대 역할 글의 매칭률.
 * 관리자 정기 매칭과 같은 거리·경로 계산을 쓰고, 시간은 점수에 넣지 않고 '시간 맞음' 표시만 한다.
 * 후보 = 출발지·도착지가 모두 반경 안이거나, 돌아가는 거리가 반경 안(가는 길 위).
 */
export type PostMatch = {
  post: Post;
  /** 종합 매칭률(%) = 거리 점수 50% + 경로 일치율 50%(경로를 못 재면 거리 점수만) */
  pct: number;
  /** 경로 일치율(%) — 위치가 모자라면 null */
  routePct: number | null;
  /** 출발지끼리 거리(km) */
  originKm: number;
  /** 가는 길 위(집·회사는 반경 밖이지만 돌아가는 거리가 반경 안) */
  onRoute: boolean;
  /** 출근(또는 가는 시각)이 30분 안, 퇴근이 60분 안으로 맞으면 true, 시각이 없으면 null */
  timeOk: boolean | null;
};

const DEFAULT_RADIUS_KM = 3;
const mins = (t?: string | null) => (t && /^\d{1,2}:\d{2}$/.test(t) ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]) : null);
function timeDiff(a?: string | null, b?: string | null) {
  const x = mins(a);
  const y = mins(b);
  if (x == null || y == null) return null;
  const d = Math.abs(x - y);
  return Math.min(d, 1440 - d);
}

/** 글 한 건 기준 매칭 상대 중 매칭률 높은 순(최대 limit명). 내 글이거나 종료·마감된 글, 같은 회원 글은 뺀다. */
export function matchesFor(mine: Post, all: Post[], limit = 3, radiusKm = DEFAULT_RADIUS_KM): PostMatch[] {
  if (mine.originLat == null || mine.originLng == null) return [];
  const out: PostMatch[] = [];
  for (const p of all) {
    if (p.id === mine.id || p.role === mine.role || p.mine) continue;
    if (mine.ownerId && p.ownerId === mine.ownerId) continue;
    if (p.ended || p.status === "closed") continue;
    if (p.originLat == null || p.originLng == null) continue;
    const driver = mine.role === "driver" ? mine : p;
    const rider = mine.role === "driver" ? p : mine;
    const d = { homeLat: driver.originLat ?? null, homeLng: driver.originLng ?? null, workLat: driver.destLat ?? null, workLng: driver.destLng ?? null };
    const r = { homeLat: rider.originLat ?? null, homeLng: rider.originLng ?? null, workLat: rider.destLat ?? null, workLng: rider.destLng ?? null };
    const homeKm = km(d.homeLat as number, d.homeLng as number, r.homeLat as number, r.homeLng as number);
    const both = d.workLat != null && d.workLng != null && r.workLat != null && r.workLng != null;
    const workKm = both ? km(d.workLat as number, d.workLng as number, r.workLat as number, r.workLng as number) : -1;
    const near = homeKm <= radiusKm && workKm <= radiusKm;
    if (!near && homeKm > radiusKm * 6) continue;
    const detourKm = both ? detourOf(d, r) : null;
    if (!near && (detourKm == null || detourKm > radiusKm)) continue;
    const sum = homeKm + (workKm < 0 ? homeKm : workKm);
    const distRaw = near ? 1 - sum / (2 * radiusKm) : 1 - (detourKm as number) / radiusKm;
    const distPct = Math.max(1, Math.round(100 * distRaw));
    const rm = routeMatch(d, r, radiusKm);
    const routePct = rm == null ? null : Math.round(100 * rm);
    const pct = Math.max(1, routePct == null ? distPct : Math.round((distPct + routePct) / 2));
    const goDiff = timeDiff(mine.timeGo, p.timeGo);
    const backDiff = timeDiff(mine.timeBack, p.timeBack);
    const timeOk = goDiff == null && backDiff == null ? null : (goDiff == null || goDiff <= 30) && (backDiff == null || backDiff <= 60);
    out.push({ post: p, pct, routePct, originKm: Math.round(homeKm * 10) / 10, onRoute: !near, timeOk });
  }
  return out.sort((a, b) => b.pct - a.pct || a.originKm - b.originKm).slice(0, limit);
}
