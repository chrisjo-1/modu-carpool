import { CITY_WORD, searchPlaces, type Item } from "./placeSearch";
import { db } from "./server";
import { geocodeAddress } from "./warpPool";

/**
 * 위치(좌표) 없이 이름만 저장된 글을 서버가 이름으로 찾아 채운다(2026-10-29 사용자 지시).
 * 장소 칸에서 목록을 고르지 않고 글자만 적으면 좌표가 비어 지역 글씨·가까운 순·지도·경로 알림에서 빠졌다.
 * - 이름이 맞는 후보만 쓴다(찾은 이름이 적은 글자 안에 있거나 그 반대). 시·도를 적었으면 그 시·도 주소인 후보만.
 * - 한 번 시도한 글은 geo_tried_at 을 남겨 7일 동안 다시 묻지 않는다(무료 지도 호출량 보호).
 * GET /api/posts 응답 뒤 after()에서 지역 글씨 채우기 전에 부른다.
 */
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

const CITY_ALIAS: Record<string, string[]> = {
  서울: ["서울"], 부산: ["부산"], 대구: ["대구"], 인천: ["인천"], 광주: ["광주"], 대전: ["대전"], 울산: ["울산"], 세종: ["세종"],
  경기: ["경기"], 강원: ["강원"], 충북: ["충북", "충청북도"], 충남: ["충남", "충청남도"], 전북: ["전북", "전라북도"], 전남: ["전남", "전라남도"],
  경북: ["경북", "경상북도"], 경남: ["경남", "경상남도"], 제주: ["제주"],
};

/** 이름에 맞는 후보 하나를 고른다. 맞는 것이 없으면 null. */
export function pickMatch(name: string, items: Item[]): Item | null {
  const q = norm(name);
  const city = name.split(/\s+/).map((w) => w.match(CITY_WORD)?.[1]).find(Boolean);
  for (const i of items) {
    const n = norm(i.name);
    if (n.length < 2) continue;
    if (!(q.includes(n) || n.includes(q))) continue;
    if (city && !(CITY_ALIAS[city] ?? [city]).some((c) => `${i.address} ${i.name}`.includes(c))) continue;
    return i;
  }
  return null;
}

/** 도로명(…로 12, …길 3-4)·지번(…동 123) 주소처럼 보이는 글자 */
export const looksLikeAddress = (s: string) => /(로|길)\s*\d|\d+-\d+|(동|리|가)\s+\d/.test(s);

export async function geocodeName(name: string): Promise<Item | null> {
  const q = name.trim();
  if (q.length < 2) return null;
  const items = await searchPlaces(q, "ko").catch(() => [] as Item[]);
  const hit = pickMatch(q, items);
  if (hit) return hit;
  // 목록에서 안 고르고 주소를 그대로 적은 글(예: "경기 김포 풍년로 46-2")은 이름 검색으로는 안 맞아 위치가 비었다
  // → 주소 검색(카카오 → Photon → OSM)으로 다시 찾는다(2026-11-23 사용자 지적: 지역 글씨·예상 택시비가 안 뜸)
  if (looksLikeAddress(q)) {
    const g = await geocodeAddress(q, Date.now() + 15_000).catch(() => null);
    if (g && g !== "late") return { name: q, address: q, lat: g.lat, lng: g.lng };
  }
  return null;
}

export async function fillPostCoords(limit = 3) {
  const sql = db();
  const rows = await sql`
    select id, origin, dest, origin_lat is null as no_o, dest_lat is null as no_d from posts
    where (origin_lat is null or dest_lat is null)
      and (geo_tried_at is null or geo_tried_at < now() - interval '7 days')
      and created_at > now() - interval '90 days'
    order by created_at desc limit ${limit}`;
  for (const r of rows) {
    const o = r.no_o ? await geocodeName(String(r.origin ?? "")) : null;
    const d = r.no_d ? await geocodeName(String(r.dest ?? "")) : null;
    await sql`update posts set geo_tried_at = now(),
        origin_lat = coalesce(origin_lat, ${o?.lat ?? null}), origin_lng = coalesce(origin_lng, ${o?.lng ?? null}),
        dest_lat = coalesce(dest_lat, ${d?.lat ?? null}), dest_lng = coalesce(dest_lng, ${d?.lng ?? null})
      where id = ${r.id}`;
  }
}
