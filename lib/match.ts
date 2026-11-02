/**
 * 거리·경로 매칭의 순수 계산(DB를 쓰지 않아 화면과 서버 어디서나 쓴다).
 * 관리자 워프 정기 매칭(lib/warpPool.ts)과 회원 '내 글' 매칭(lib/postMatch.ts)이 같이 쓴다.
 */

/** 위·경도 네 개(자택·회사). 하나라도 없으면 계산하지 않는다. */
export type Coords = { homeLat: number | null; homeLng: number | null; workLat: number | null; workLng: number | null };

export function km(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const x = (d - b) * r * Math.cos(((a + c) / 2) * r);
  const y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** 위경도를 기준점 둘레의 평면 km 좌표로(가까운 거리라 충분히 정확) */
export function plane(lat0: number, lat: number, lng: number): [number, number] {
  return [lng * 111.32 * Math.cos((lat0 * Math.PI) / 180), lat * 110.57];
}

/**
 * 돌아가는 거리(km, 직선): 운전자가 탑승자 집 → 탑승자 회사를 들렀다 갈 때 더 가는 길.
 * d(운전자 집→탑승자 집) + d(탑승자 집→탑승자 회사) + d(탑승자 회사→운전자 회사) − d(운전자 집→운전자 회사). 위치가 하나라도 없으면 null.
 */
export function detourOf(d: Coords, r: Coords): number | null {
  if (d.homeLat == null || d.homeLng == null || d.workLat == null || d.workLng == null) return null;
  if (r.homeLat == null || r.homeLng == null || r.workLat == null || r.workLng == null) return null;
  const v = km(d.homeLat, d.homeLng, r.homeLat, r.homeLng) + km(r.homeLat, r.homeLng, r.workLat, r.workLng)
    + km(r.workLat, r.workLng, d.workLat, d.workLng) - km(d.homeLat, d.homeLng, d.workLat, d.workLng);
  return Math.max(0, Math.round(v * 10) / 10);
}

/**
 * 경로 일치율(0~1): 탑승자 집·회사를 운전자 길(집→회사 선분) 위에 비춰 겹치는 길이 ÷ 탑승자 이동 거리,
 * 그리고 두 점이 운전자 길에서 옆으로 떨어진 거리(큰 쪽)가 반경만큼이면 0이 되도록 깎는다. 반대 방향이면 0.
 */
export function routeMatch(d: Coords, r: Coords, radiusKm: number): number | null {
  if (d.homeLat == null || d.homeLng == null || d.workLat == null || d.workLng == null) return null;
  if (r.homeLat == null || r.homeLng == null || r.workLat == null || r.workLng == null) return null;
  const lat0 = d.homeLat;
  const A = plane(lat0, d.homeLat, d.homeLng);
  const B = plane(lat0, d.workLat, d.workLng);
  const P = plane(lat0, r.homeLat, r.homeLng);
  const Q = plane(lat0, r.workLat, r.workLng);
  const ab: [number, number] = [B[0] - A[0], B[1] - A[1]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1];
  const Lr = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  if (L2 < 0.01 || Lr < 0.3) return null;
  const L = Math.sqrt(L2);
  const t = (X: [number, number]) => ((X[0] - A[0]) * ab[0] + (X[1] - A[1]) * ab[1]) / L2;
  const off = (X: [number, number]) => {
    const k = Math.max(0, Math.min(1, t(X)));
    return Math.hypot(X[0] - (A[0] + ab[0] * k), X[1] - (A[1] + ab[1] * k));
  };
  const t1 = Math.max(0, Math.min(1, t(P)));
  const t2 = Math.max(0, Math.min(1, t(Q)));
  if (t2 <= t1) return 0;
  const cover = Math.min(1, ((t2 - t1) * L) / Lr);
  const side = Math.max(0, 1 - Math.max(off(P), off(Q)) / Math.max(1, radiusKm));
  return cover * side;
}
