import { detourOf, km, plane, routeMatch, type Coords } from "./match";
import { db } from "./server";

/**
 * 남의 카풀 글 상세의 '나와의 매칭'(2026-11-27 사용자 지시 '상대 카풀 상세에서 나와의 매칭률과 경로상 일치하는 노선을 지도로').
 * 내 진행 중 글(반대 역할) 가운데 가장 잘 맞는 것, 없으면 내 출퇴근 정보(집·회사)와 비교한다.
 * 점수는 '매칭 가능성 있는 회원'(lib/postMatch.ts)과 같은 계산(반경 3km, 거리 점수와 경로 일치율 반반)이지만
 * 후보 거르기 없이 늘 점수를 낸다(멀면 낮게). 요일·시간 일치는 점수에 넣지 않는다(추후 반영, 사용자 지시).
 */
const RADIUS = 3;
type LL = [number, number];
export type WithMe = {
  mine: { origin: string; dest: string; kind: "post" | "commute" };
  myRole: "driver" | "rider";
  pct: number;
  routePct: number | null;
  originKm: number;
  destKm: number | null;
  onRoute: boolean;
  driver: { o: LL; d: LL | null };
  rider: { o: LL; d: LL | null };
  /** 운전자 길 위에서 탑승자 길과 겹치는 구간(탑승자 출발·도착을 운전자 길에 비춘 두 점) */
  overlap: { a: LL; b: LL } | null;
};

type Pt = { lat: number | null; lng: number | null };
type Cand = { origin: string; dest: string; kind: "post" | "commute"; o: Pt; d: Pt };

function score(driver: Cand, rider: Cand) {
  const dc: Coords = { homeLat: driver.o.lat, homeLng: driver.o.lng, workLat: driver.d.lat, workLng: driver.d.lng };
  const rc: Coords = { homeLat: rider.o.lat, homeLng: rider.o.lng, workLat: rider.d.lat, workLng: rider.d.lng };
  const homeKm = km(dc.homeLat as number, dc.homeLng as number, rc.homeLat as number, rc.homeLng as number);
  const both = dc.workLat != null && dc.workLng != null && rc.workLat != null && rc.workLng != null;
  const workKm = both ? km(dc.workLat as number, dc.workLng as number, rc.workLat as number, rc.workLng as number) : null;
  const near = homeKm <= RADIUS && (workKm == null || workKm <= RADIUS);
  const detour = both ? detourOf(dc, rc) : null;
  const onRoute = !near && detour != null && detour <= RADIUS;
  const sum = homeKm + (workKm == null ? homeKm : workKm);
  const distRaw = near ? 1 - sum / (2 * RADIUS) : onRoute ? 1 - (detour as number) / RADIUS : 0;
  const distPct = Math.max(0, Math.round(100 * distRaw));
  const rm = routeMatch(dc, rc, RADIUS);
  const routePct = rm == null ? null : Math.round(100 * rm);
  const pct = Math.max(0, routePct == null ? distPct : Math.round((distPct + routePct) / 2));
  return { pct, routePct, originKm: Math.round(homeKm * 10) / 10, destKm: workKm == null ? null : Math.round(workKm * 10) / 10, onRoute, dc, rc };
}

/** 탑승자 출발·도착을 운전자 길(직선)에 비춘 구간. 반대 방향이거나 못 재면 null. */
function overlapOf(dc: Coords, rc: Coords): { a: LL; b: LL } | null {
  if (dc.homeLat == null || dc.homeLng == null || dc.workLat == null || dc.workLng == null) return null;
  if (rc.homeLat == null || rc.homeLng == null || rc.workLat == null || rc.workLng == null) return null;
  const lat0 = dc.homeLat;
  const A = plane(lat0, dc.homeLat, dc.homeLng);
  const B = plane(lat0, dc.workLat, dc.workLng);
  const ab = [B[0] - A[0], B[1] - A[1]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1];
  if (L2 < 0.01) return null;
  const t = (lat: number, lng: number) => {
    const X = plane(lat0, lat, lng);
    return Math.max(0, Math.min(1, ((X[0] - A[0]) * ab[0] + (X[1] - A[1]) * ab[1]) / L2));
  };
  const t1 = t(rc.homeLat, rc.homeLng);
  const t2 = t(rc.workLat, rc.workLng);
  if (t2 - t1 < 0.02) return null;
  const at = (k: number): LL => [dc.homeLat! + (dc.workLat! - dc.homeLat!) * k, dc.homeLng! + (dc.workLng! - dc.homeLng!) * k];
  return { a: at(t1), b: at(t2) };
}

/** 결과: 비교할 내 정보가 없으면 {none}, 같은 역할 글이면 {sameRole}, 아니면 WithMe */
export async function withMe(me: string, postId: string): Promise<WithMe | { none: true } | { sameRole: true } | null> {
  const sql = db();
  const [p] = await sql`select p.id, p.user_id, p.role, p.origin, p.dest, p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng
    from posts p join users u on u.id = p.user_id
    where p.id = ${postId} and not u.blocked and u.withdrawn_at is null`;
  if (!p || p.origin_lat == null || String(p.user_id) === me) return null;
  const myRole: "driver" | "rider" = p.role === "driver" ? "rider" : "driver";
  const mine = await sql`select origin, dest, origin_lat, origin_lng, dest_lat, dest_lng from posts
    where user_id = ${me} and role = ${myRole} and status <> 'closed' and origin_lat is not null
      and (regular or depart_at > now() - interval '1 day')
    order by regular desc, created_at desc limit 20`;
  const cands: Cand[] = mine.map((r) => ({
    origin: String(r.origin), dest: String(r.dest), kind: "post" as const,
    o: { lat: r.origin_lat, lng: r.origin_lng }, d: { lat: r.dest_lat ?? null, lng: r.dest_lng ?? null },
  }));
  if (!cands.length) {
    const [u] = await sql`select role_pref, commute_origin, commute_dest, commute_olat, commute_olng, commute_dlat, commute_dlng from users where id = ${me}`;
    if (u && u.commute_olat != null) {
      if (u.role_pref && u.role_pref !== myRole) return { sameRole: true };
      cands.push({ origin: String(u.commute_origin), dest: String(u.commute_dest), kind: "commute",
        o: { lat: u.commute_olat, lng: u.commute_olng }, d: { lat: u.commute_dlat ?? null, lng: u.commute_dlng ?? null } });
    } else {
      const any = await sql`select 1 from posts where user_id = ${me} and role = ${p.role} and status <> 'closed' limit 1`;
      return any.length ? { sameRole: true } : { none: true };
    }
  }
  const them: Cand = { origin: String(p.origin), dest: String(p.dest), kind: "post",
    o: { lat: p.origin_lat, lng: p.origin_lng }, d: { lat: p.dest_lat ?? null, lng: p.dest_lng ?? null } };
  let best: (ReturnType<typeof score> & { c: Cand }) | null = null;
  for (const c of cands) {
    const s = myRole === "driver" ? score(c, them) : score(them, c);
    if (!best || s.pct > best.pct || (s.pct === best.pct && s.originKm < best.originKm)) best = { ...s, c };
  }
  if (!best) return { none: true };
  const ll = (x: Pt): LL | null => (x.lat != null && x.lng != null ? [x.lat, x.lng] : null);
  const drv = myRole === "driver" ? best.c : them;
  const rdr = myRole === "driver" ? them : best.c;
  return {
    mine: { origin: best.c.origin, dest: best.c.dest, kind: best.c.kind },
    myRole,
    pct: best.pct,
    routePct: best.routePct,
    originKm: best.originKm,
    destKm: best.destKm,
    onRoute: best.onRoute,
    driver: { o: ll(drv.o) as LL, d: ll(drv.d) },
    rider: { o: ll(rdr.o) as LL, d: ll(rdr.d) },
    overlap: overlapOf(best.dc, best.rc),
  };
}
