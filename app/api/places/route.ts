import { text } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 장소 검색(?q=)과 좌표→주소 변환(?lat=&lng=).
 * KAKAO_REST_KEY 가 있으면 카카오 로컬 API를, 없으면 OpenStreetMap(Nominatim)을 쓴다.
 * 외부 API 키와 호출량을 서버에서 관리하려고 브라우저가 직접 부르지 않게 했다.
 */
type Item = { name: string; address: string; lat: number; lng: number };

const UA = "modu-carpool/1.0 (https://modu-carpool.vercel.app)";
const out = (data: unknown, cacheSeconds: number) =>
  Response.json(data, { headers: { "Cache-Control": cacheSeconds ? `public, s-maxage=${cacheSeconds}, max-age=300` : "no-store" } });

// 인스턴스 단위의 간단한 호출 제한(분당 40회). CDN 캐시와 함께 외부 API 남용을 줄인다.
const hits = new Map<string, { n: number; t: number }>();
function limited(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > 40;
}

async function get(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

async function kakaoSearch(q: string, key: string): Promise<Item[]> {
  const d = await get(`https://dapi.kakao.com/v2/local/search/keyword.json?size=8&query=${encodeURIComponent(q)}`, { Authorization: `KakaoAK ${key}` });
  return ((d.documents ?? []) as Record<string, string>[]).map((x) => ({
    name: x.place_name,
    address: x.road_address_name || x.address_name || "",
    lat: Number(x.y),
    lng: Number(x.x),
  }));
}

async function kakaoReverse(lat: number, lng: number, key: string): Promise<string> {
  const d = await get(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, { Authorization: `KakaoAK ${key}` });
  const doc = d.documents?.[0];
  return doc?.road_address?.building_name || doc?.road_address?.address_name || doc?.address?.address_name || "";
}

async function osmSearch(q: string, lang: string): Promise<Item[]> {
  const d = await get(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=kr&q=${encodeURIComponent(q)}`,
    { "User-Agent": UA, "Accept-Language": lang },
  );
  return (d as Record<string, string>[]).map((x) => {
    const parts = String(x.display_name ?? "").split(",").map((s) => s.trim());
    return {
      name: x.name || parts[0] || q,
      address: parts.slice(1, 4).join(", "),
      lat: Number(x.lat),
      lng: Number(x.lon),
    };
  });
}

async function osmReverse(lat: number, lng: number, lang: string): Promise<string> {
  const d = await get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`, { "User-Agent": UA, "Accept-Language": lang });
  const a = (d.address ?? {}) as Record<string, string>;
  const area = a.neighbourhood || a.quarter || a.suburb || a.borough || a.city_district || "";
  const road = [a.road, a.house_number].filter(Boolean).join(" ");
  return d.name || [area, road].filter(Boolean).join(" ") || String(d.display_name ?? "").split(",").slice(0, 2).join(" ").trim();
}

export async function GET(req: Request) {
  if (limited(req)) return Response.json({ items: [], name: "", error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  const p = new URL(req.url).searchParams;
  const q = text(p.get("q"), 60);
  const lang = ["ko", "en", "ja", "zh"].includes(p.get("lang") ?? "") ? (p.get("lang") as string) : "ko";
  const key = process.env.KAKAO_REST_KEY;
  try {
    if (q.length >= 2) {
      const items = (key ? await kakaoSearch(q, key) : await osmSearch(q, lang)).filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng));
      return out({ items }, 3600);
    }
    const lat = Number(p.get("lat"));
    const lng = Number(p.get("lng"));
    if (p.get("lat") && p.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      const name = key ? await kakaoReverse(lat, lng, key) : await osmReverse(lat, lng, lang);
      return out({ name }, 3600);
    }
    return out({ items: [], name: "" }, 0);
  } catch (e) {
    console.error("[places]", e);
    return out({ items: [], name: "", error: "장소 정보를 불러오지 못했습니다." }, 0);
  }
}
