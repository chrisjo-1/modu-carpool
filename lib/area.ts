import { db } from "./server";

/**
 * 좌표 → "서울 마포구 공덕동" 같은 짧은 지역 이름(시·구·동까지, 번지는 넣지 않는다).
 * 카카오 coord2regioncode(법정동)를 쓰고, 키가 없거나 거절되면 OSM(Nominatim)으로 대신한다.
 */
const SHORT: Record<string, string> = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주",
  대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종",
};
const cache = new Map<string, string>();
// 카카오 키가 거절되면(지도 서비스 미사용 설정 등) 이 서버가 떠 있는 동안은 무료 지도(OSM)로 대신한다.
let kakaoDown = false;
const UA = "modu-carpool/1.0 (https://moducarpool.com)";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OSM(Nominatim) 역지오코딩으로 시·구·동. 이용 규칙상 1초에 1번만 부른다. */
async function osmRegion(lat: number, lng: number): Promise<string> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lng}`, {
    headers: { "User-Agent": UA, "Accept-Language": "ko" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`osm ${res.status}`);
  const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
  const dong = a.quarter || a.suburb || a.neighbourhood || a.village || a.town || "";
  const gu = a.borough || a.city_district || "";
  const city = a.city || a.county || "";
  const parts = a.province ? [city, gu, dong] : [SHORT[city] ?? city, gu, dong];
  return [...new Set(parts.filter(Boolean))].join(" ");
}
const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

async function regionName(lat: number, lng: number, key: string | undefined): Promise<string> {
  const k = keyOf(lat, lng);
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  if (!key || kakaoDown) {
    await wait(1100);
    const v = await osmRegion(lat, lng);
    cache.set(k, v);
    return v;
  }
  const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(4000),
  });
  if (res.status === 401 || res.status === 403) {
    console.error("[area] kakao", res.status, "→ OSM으로 대신합니다");
    kakaoDown = true;
    return regionName(lat, lng, key);
  }
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const d = (await res.json()) as { documents?: Record<string, string>[] };
  const doc = d.documents?.find((x) => x.region_type === "B") ?? d.documents?.[0];
  let out = "";
  if (doc) {
    const d1 = String(doc.region_1depth_name ?? "");
    const d2 = String(doc.region_2depth_name ?? "");
    const d3 = String(doc.region_3depth_name ?? "");
    out = (SHORT[d1] ? [SHORT[d1], d2, d3] : [d2 || d1, d3]).filter(Boolean).join(" ");
  }
  if (cache.size > 5000) cache.clear();
  cache.set(k, out);
  return out;
}

/**
 * 지역 이름이 없거나 좌표가 바뀐 글을 몇 개씩 채운다(목록 응답 뒤에 after()로 부른다).
 * area_key 에 계산한 좌표를 적어 두어, 좌표가 바뀌면 다시 계산한다.
 */
export async function fillPostAreas(limit = 15) {
  const key = process.env.KAKAO_REST_KEY;
  // OSM은 1초에 1번이라 한 번에 조금만 채운다.
  if (!key || kakaoDown) limit = Math.min(limit, 4);
  const sql = db();
  const rows = await sql`
    select id, origin_lat, origin_lng, dest_lat, dest_lng, origin_area_key, dest_area_key from posts
    where (origin_lat is not null and origin_area_key is distinct from concat(round(origin_lat::numeric, 4), ',', round(origin_lng::numeric, 4)))
       or (dest_lat is not null and dest_area_key is distinct from concat(round(dest_lat::numeric, 4), ',', round(dest_lng::numeric, 4)))
    order by created_at desc limit ${limit}`;
  let done = 0;
  for (const r of rows) {
    // 도중에 OSM으로 바뀌었으면 몇 개만 하고 다음 요청 때 이어서 한다.
    if (kakaoDown && done >= 4) return;
    done += 1;
    try {
      const oLat = r.origin_lat == null ? null : Number(r.origin_lat);
      const oLng = r.origin_lng == null ? null : Number(r.origin_lng);
      const dLat = r.dest_lat == null ? null : Number(r.dest_lat);
      const dLng = r.dest_lng == null ? null : Number(r.dest_lng);
      const oKey = oLat != null && oLng != null ? keyOf(oLat, oLng) : null;
      const dKey = dLat != null && dLng != null ? keyOf(dLat, dLng) : null;
      const oArea = oKey && oKey !== r.origin_area_key ? await regionName(oLat as number, oLng as number, key) : null;
      const dArea = dKey && dKey !== r.dest_area_key ? await regionName(dLat as number, dLng as number, key) : null;
      await sql`update posts set
          origin_area = coalesce(${oArea}, origin_area), origin_area_key = coalesce(${oArea === null ? null : oKey}, origin_area_key),
          dest_area = coalesce(${dArea}, dest_area), dest_area_key = coalesce(${dArea === null ? null : dKey}, dest_area_key)
        where id = ${r.id}`;
    } catch (e) {
      console.error("[area]", (e as Error).message);
      return; // 카카오가 응답하지 않으면 이번에는 그만두고 다음 목록 요청 때 이어서 한다.
    }
  }
}
