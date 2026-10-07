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
    address: [String(x.category_name ?? "").split(" > ").pop(), x.road_address_name || x.address_name].filter(Boolean).join(" · "),
    lat: Number(x.y),
    lng: Number(x.x),
  }));
}

async function kakaoReverse(lat: number, lng: number, key: string): Promise<string> {
  const d = await get(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, { Authorization: `KakaoAK ${key}` });
  const doc = d.documents?.[0];
  return doc?.road_address?.building_name || doc?.road_address?.address_name || doc?.address?.address_name || "";
}

/** 장소 종류를 사람이 읽는 말로. [한국어, 영어] */
const KIND: Record<string, [string, string]> = {
  "railway:station": ["지하철·기차역", "Station"],
  "railway:subway_entrance": ["지하철 출구", "Subway exit"],
  "highway:bus_stop": ["버스 정류장", "Bus stop"],
  "building:apartments": ["아파트", "Apartments"],
  "landuse:residential": ["주거 단지", "Residential area"],
  "amenity:school": ["학교", "School"],
  "amenity:university": ["대학교", "University"],
  "amenity:hospital": ["병원", "Hospital"],
  "amenity:cafe": ["카페", "Cafe"],
  "amenity:restaurant": ["음식점", "Restaurant"],
  "amenity:parking": ["주차장", "Parking"],
  "amenity:bank": ["은행", "Bank"],
  "leisure:park": ["공원", "Park"],
  "tourism:hotel": ["호텔", "Hotel"],
  "tourism:attraction": ["관광지", "Attraction"],
  shop: ["상점", "Shop"],
  office: ["사무실", "Office"],
  building: ["건물", "Building"],
  amenity: ["시설", "Facility"],
  tourism: ["관광", "Tourism"],
  leisure: ["여가 시설", "Leisure"],
  railway: ["철도", "Rail"],
  place: ["지역", "Area"],
  boundary: ["행정구역", "District"],
  highway: ["도로", "Road"],
};
const kindOf = (key: string, value: string, lang: string) => {
  const k = KIND[`${key}:${value}`] ?? KIND[key];
  return k ? k[lang === "ko" ? 0 : 1] : "";
};

/** 같은 이름이 200m 안에 여러 개면 하나만 남기고, 도로·행정구역은 뒤로 보낸다. */
function tidy(items: (Item & { weak?: boolean })[]): Item[] {
  const kept: (Item & { weak?: boolean })[] = [];
  for (const i of items) {
    if (!Number.isFinite(i.lat) || !Number.isFinite(i.lng) || !i.name) continue;
    if (kept.some((k) => k.name === i.name && meters(k.lat, k.lng, i.lat, i.lng) < 200)) continue;
    kept.push(i);
  }
  return [...kept.filter((k) => !k.weak), ...kept.filter((k) => k.weak)].slice(0, 8).map(({ name, address, lat, lng }) => ({ name, address, lat, lng }));
}
const join = (parts: (string | undefined)[], sep: string) => parts.filter(Boolean).join(sep);

/** 입력 중 자동완성에 맞는 검색(Photon). 건물 종류와 시·구·도로명을 함께 돌려준다. */
async function photonSearch(q: string, lang: string): Promise<Item[]> {
  const d = await get(
    `https://photon.komoot.io/api/?limit=15&lang=${lang === "en" ? "en" : "default"}&bbox=124.5,33,131.9,38.7&q=${encodeURIComponent(q)}`,
    { "User-Agent": UA },
  );
  type F = { geometry?: { coordinates?: number[] }; properties?: Record<string, string> };
  return tidy(
    ((d.features ?? []) as F[])
      .filter((f) => !f.properties?.countrycode || f.properties.countrycode === "KR")
      .map((f) => {
        const p = f.properties ?? {};
        const road = join([p.street, p.housenumber], " ");
        return {
          name: p.name || road,
          address: join([kindOf(p.osm_key ?? "", p.osm_value ?? "", lang), join([p.city || p.county || p.state, p.district || p.locality, p.name ? road : ""], " ")], " · "),
          lat: Number(f.geometry?.coordinates?.[1]),
          lng: Number(f.geometry?.coordinates?.[0]),
          weak: p.osm_key === "highway" || p.osm_key === "place" || p.osm_key === "boundary",
        };
      }),
  );
}

async function osmSearch(q: string, lang: string): Promise<Item[]> {
  const d = await get(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=15&countrycodes=kr&q=${encodeURIComponent(q)}`,
    { "User-Agent": UA, "Accept-Language": lang },
  );
  return tidy(
    (d as (Record<string, string> & { address?: Record<string, string> })[]).map((x) => {
      const a = x.address ?? {};
      const road = join([a.road, a.house_number], " ");
      return {
        name: x.name || road || q,
        address: join([kindOf(x.category ?? "", x.type ?? "", lang), join([a.city || a.county || a.province, a.borough || a.city_district, a.suburb || a.quarter || a.neighbourhood, x.name ? road : ""], " ")], " · "),
        lat: Number(x.lat),
        lng: Number(x.lon),
        weak: x.category === "highway" || x.category === "place" || x.category === "boundary",
      };
    }),
  );
}

/** 자동완성용 검색을 먼저 쓰고, 실패하거나 결과가 없으면 일반 검색으로 넘어간다. */
async function freeSearch(q: string, lang: string): Promise<Item[]> {
  const first = await photonSearch(q, lang).catch((e) => {
    console.error("[places] photon", e);
    return [] as Item[];
  });
  return first.length ? first : osmSearch(q, lang);
}

/** 두 좌표 사이 거리(m) */
function meters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = Math.PI / 180;
  const x = (lng2 - lng1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}

const NEAR: Record<string, (n: string) => string> = {
  ko: (n) => `${n} 근처`,
  en: (n) => `Near ${n}`,
  ja: (n) => `${n}付近`,
  zh: (n) => `${n}附近`,
};

/** 주변 150m 안에서 이름 있는 건물·시설·역 가운데 가장 가까운 것을 찾는다. 실패하면 null. */
async function osmLandmark(lat: number, lng: number, lang: string): Promise<{ name: string; dist: number } | null> {
  const q =
    `[out:json][timeout:4];(` +
    `nwr(around:150,${lat},${lng})[name][building];` +
    `nwr(around:150,${lat},${lng})[name][amenity];` +
    `nwr(around:150,${lat},${lng})[name][shop];` +
    `nwr(around:150,${lat},${lng})[name][leisure];` +
    `nwr(around:150,${lat},${lng})[name][tourism];` +
    `nwr(around:150,${lat},${lng})[name][office];` +
    `nwr(around:150,${lat},${lng})[name][landuse=residential];` +
    `nwr(around:250,${lat},${lng})[name][railway=station];` +
    `);out tags center 60;`;
  try {
    const d = await get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { "User-Agent": UA });
    let best: { name: string; score: number; dist: number } | null = null;
    for (const e of (d.elements ?? []) as { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]) {
      const t = e.tags ?? {};
      const la = e.lat ?? e.center?.lat;
      const lo = e.lon ?? e.center?.lon;
      const name = (lang !== "ko" && t[`name:${lang}`]) || t["name:ko"] || t.name;
      if (la == null || lo == null || !name) continue;
      const dist = meters(lat, lng, la, lo);
      // 역·아파트 단지·큰 건물은 조금 멀어도 알아보기 쉬우므로 우선한다.
      const known = t.railway === "station" || t.building === "apartments" || t.landuse === "residential" || t.amenity === "school" || t.amenity === "hospital" || t.leisure === "park";
      const score = dist * (known ? 0.5 : 1);
      if (!best || score < best.score) best = { name, score, dist };
    }
    return best ? { name: best.name, dist: best.dist } : null;
  } catch {
    return null;
  }
}

/**
 * 좌표를 "건물·시설 이름 (동 도로명 번지)" 꼴로 바꾼다.
 * 도로명만으로는 어디인지 알기 어려워, 그 자리의 건물 이름이나 가장 가까운 시설 이름을 앞에 둔다.
 */
async function osmReverse(lat: number, lng: number, lang: string): Promise<string> {
  const [d, mark] = await Promise.all([
    get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`, { "User-Agent": UA, "Accept-Language": lang }),
    osmLandmark(lat, lng, lang),
  ]);
  const a = (d.address ?? {}) as Record<string, string>;
  const dong = a.quarter || a.neighbourhood || a.suburb || a.village || a.town || "";
  const road = [a.road, a.house_number].filter(Boolean).join(" ");
  const base = [dong, road].filter(Boolean).join(" ") || String(d.display_name ?? "").split(",").slice(0, 2).join(" ").trim();
  // 그 자리 자체가 이름 있는 건물·시설이면 그 이름을 쓰고(도로 이름은 제외), 아니면 가까운 시설을 쓴다.
  const here = d.name && d.category !== "highway" && d.name !== a.road ? String(d.name) : "";
  const main = here || (mark ? (mark.dist <= 35 ? mark.name : (NEAR[lang] ?? NEAR.ko)(mark.name)) : "");
  const label = main && base && !base.includes(main) ? `${main} (${base})` : main || base;
  return label.slice(0, 60);
}

export async function GET(req: Request) {
  if (limited(req)) return Response.json({ items: [], name: "", error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  const p = new URL(req.url).searchParams;
  const q = text(p.get("q"), 60);
  const lang = ["ko", "en", "ja", "zh"].includes(p.get("lang") ?? "") ? (p.get("lang") as string) : "ko";
  const key = process.env.KAKAO_REST_KEY;
  try {
    if (q.length >= 2) {
      const items = (key ? await kakaoSearch(q, key) : await freeSearch(q, lang)).filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng));
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
