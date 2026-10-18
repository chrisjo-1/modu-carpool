import { db } from "./server";

/**
 * 좌표 → "서울 마포구 공덕동" 같은 짧은 지역 이름(시·구·동까지, 번지는 넣지 않는다).
 * 카카오 coord2regioncode(법정동)를 쓴다. KAKAO_REST_KEY 가 없으면 아무것도 하지 않는다.
 */
const SHORT: Record<string, string> = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주",
  대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종",
};
const cache = new Map<string, string>();
const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

async function regionName(lat: number, lng: number, key: string): Promise<string> {
  const k = keyOf(lat, lng);
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(4000),
  });
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
  if (!key) return;
  const sql = db();
  const rows = await sql`
    select id, origin_lat, origin_lng, dest_lat, dest_lng, origin_area_key, dest_area_key from posts
    where (origin_lat is not null and origin_area_key is distinct from concat(round(origin_lat::numeric, 4), ',', round(origin_lng::numeric, 4)))
       or (dest_lat is not null and dest_area_key is distinct from concat(round(dest_lat::numeric, 4), ',', round(dest_lng::numeric, 4)))
    order by created_at desc limit ${limit}`;
  for (const r of rows) {
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
