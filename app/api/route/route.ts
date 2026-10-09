import { distanceKm } from "@/lib/geo";

export const dynamic = "force-dynamic";

const hits = new Map<string, { n: number; t: number }>();
function limited(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  return ++h.n > 30;
}

const num = (v: string | null) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN);
const inKorea = (lat: number, lng: number) => lat > 32 && lat < 39.5 && lng > 124 && lng < 132;

/** 두 지점의 도로 거리(m)와 시간(초). 경로 엔진이 안 되면 직선거리로 어림한다. */
export async function GET(req: Request) {
  if (limited(req)) return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  const p = new URL(req.url).searchParams;
  const [olat, olng, dlat, dlng] = ["olat", "olng", "dlat", "dlng"].map((k) => num(p.get(k)));
  if (![olat, olng, dlat, dlng].every(Number.isFinite) || !inKorea(olat, olng) || !inKorea(dlat, dlng))
    return Response.json({ error: "출발지와 도착지 위치가 필요합니다." }, { status: 400 });
  const cache = { "Cache-Control": "public, s-maxage=86400, max-age=3600" };
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${olng},${olat};${dlng},${dlat}?overview=false&alternatives=false`;
    const r = await fetch(url, { headers: { "User-Agent": "modu-carpool/1.0" }, signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const route = j?.routes?.[0];
    if (r.ok && route && route.distance > 0) return Response.json({ meters: Math.round(route.distance), seconds: Math.round(route.duration * 1.25), source: "road" }, { headers: cache });
    throw new Error(`osrm ${r.status} ${j?.code}`);
  } catch (e) {
    console.error("[route]", e);
    // 직선거리 × 1.35 를 도로 거리로, 평균 시속 30km 로 시간을 어림한다.
    const meters = Math.round(distanceKm(olat, olng, dlat, dlng) * 1350);
    return Response.json({ meters, seconds: Math.round(meters / (30_000 / 3600)), source: "estimate" }, { headers: { "Cache-Control": "public, max-age=600" } });
  }
}
