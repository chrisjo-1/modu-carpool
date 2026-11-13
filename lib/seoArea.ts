import { db, ensureSchema, hasDb } from "./server";
import { dayLabel } from "./i18n";

/**
 * 네이버 SEO(2026-11-13 사용자 지시): 구 단위 지역 카풀 페이지 공용.
 * 지역 글씨(posts.origin_area/dest_area, 예 "서울 강남구 역삼동", "성남시 분당구 정자동")의 앞 두 낱말 = 구 키("서울 강남구").
 * 주소 조각(slug)은 낱말 사이를 '-'로: /carpool/서울-강남구
 */
export const areaKey = (area: string | null | undefined) => {
  const p = String(area ?? "").trim().split(/\s+/).filter(Boolean);
  return p.length >= 2 ? `${p[0]} ${p[1]}` : "";
};
export const areaSlug = (key: string) => key.replace(/\s+/g, "-");
export const slugArea = (slug: string) => decodeURIComponent(slug).replace(/-/g, " ").trim();
/** 짧은 이름: "서울 강남구" → "강남구", "성남시 분당구" → "분당구" */
export const shortArea = (key: string) => key.split(" ").pop() ?? key;
/** 이 수보다 글이 적은 구 페이지는 검색에 올리지 않는다(얇은 페이지). */
export const AREA_MIN_POSTS = 3;

export type SeoPost = {
  id: string; origin: string; dest: string; originArea: string; destArea: string; role: string;
  regular: boolean; days: string; timeGo: string; departAt: number; cost: string; price: number; createdAt: number;
};


function mapRow(r: Record<string, unknown>): SeoPost {
  return {
    id: String(r.id), origin: String(r.origin ?? ""), dest: String(r.dest ?? ""),
    originArea: String(r.origin_area ?? ""), destArea: String(r.dest_area ?? ""), role: String(r.role),
    regular: !!r.regular, days: String(r.days ?? ""), timeGo: String(r.time_go ?? ""),
    departAt: r.depart_at ? new Date(r.depart_at as string).getTime() : 0,
    cost: String(r.cost ?? ""), price: Number(r.price ?? 0), createdAt: new Date(r.created_at as string).getTime(),
  };
}

/** 진행 중인 공개 글(정기 또는 출발 전 1회, 임시글·테스트·차단 제외), 최신 순. area를 주면 그 구에서 출발·도착하는 글만. */
export async function openPosts(opts: { area?: string; limit?: number } = {}): Promise<SeoPost[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  const lim = opts.limit ?? 50;
  const like = opts.area ? `${opts.area} %` : null;
  const rows = await db()`
    select p.id, p.origin, p.dest, p.origin_area, p.dest_area, p.role, p.regular, p.days, p.time_go, p.depart_at, p.cost, p.price, p.created_at
    from posts p join users u on u.id = p.user_id
    where p.status = 'open' and not p.demo and not u.test and not u.blocked and (p.regular or p.depart_at > now())
      and (${like}::text is null or p.origin_area like ${like} or p.dest_area like ${like} or p.origin_area = ${opts.area ?? ""} or p.dest_area = ${opts.area ?? ""})
    order by p.created_at desc limit ${lim}`;
  return rows.map(mapRow);
}

/** 진행 중인 글이 있는 구와 글 수(출발·도착 합), 많은 순. */
export async function areaCounts(limit = 200): Promise<{ key: string; n: number }[]> {
  if (!hasDb()) return [];
  await ensureSchema();
  const rows = await db()`
    with x as (
      select p.origin_area a from posts p join users u on u.id = p.user_id
        where p.status = 'open' and not p.demo and not u.test and not u.blocked and (p.regular or p.depart_at > now())
      union all
      select p.dest_area from posts p join users u on u.id = p.user_id
        where p.status = 'open' and not p.demo and not u.test and not u.blocked and (p.regular or p.depart_at > now()))
    select split_part(a, ' ', 1) || ' ' || split_part(a, ' ', 2) as k, count(*)::int as n
    from x where a is not null and position(' ' in a) > 0 group by 1 order by 2 desc limit ${limit}`;
  return rows.map((r) => ({ key: String(r.k).trim(), n: Number(r.n) })).filter((r) => r.key.includes(" "));
}

export const whenText = (p: { regular: boolean; days: string; timeGo: string; departAt: number }) =>
  p.regular
    ? `${dayLabel("ko", p.days)} ${p.timeGo} 출발`
    : `${new Date(p.departAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })} 출발`;
export const costText = (p: { cost: string; price: number }) => (p.cost === "fixed" && p.price ? `실비 분담 ${p.price.toLocaleString("ko-KR")}원` : "무료 운행");
export const roleWord = (role: string) => (role === "driver" ? "운전자" : "탑승자");
/** 검색 제목용 경로: 지역이 있으면 "강남구 → 분당구", 없으면 장소 이름 */
export const routeTitle = (p: { origin: string; dest: string; originArea: string; destArea: string }) => {
  const a = areaKey(p.originArea), b = areaKey(p.destArea);
  if (a && b && a !== b) return `${shortArea(a)} → ${shortArea(b)}`;
  // 같은 구 안: "강남구 압구정동 → 청담동"
  const dong = (s: string) => s.trim().split(/\s+/)[2] ?? "";
  if (a && a === b && dong(p.originArea) && dong(p.destArea)) return `${shortArea(a)} ${dong(p.originArea)} → ${dong(p.destArea)}`;
  return `${p.origin} → ${p.dest}`;
};
