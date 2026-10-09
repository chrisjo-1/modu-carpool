import { db } from "./server";

export const ROLE_KEYS = ["driver", "rider"] as const;
export const GENDER_KEYS = ["female", "male"] as const;
export const cleanList = (v: unknown, keys: readonly string[]) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && keys.includes(x)))] as string[] : []);

/**
 * 공지 대상 회원 id 목록. 같은 묶음 안은 '또는', 묶음끼리는 '그리고'. 빈 묶음은 전체.
 * 예) roles=[driver], genders=[female] → 여성 운전자
 * 역할: 회원이 고른 값(운전자/탑승자/둘 다)이 우선이고, 비어 있으면 올린 글·등록한 차량·구 워프 회원 구분으로 판단한다.
 * 성별: 회원이 고른 값이 우선이고, 비어 있으면 구 워프 회원 정보로 판단한다.
 */
export async function targetUsers(roles: string[], genders: string[], onlyUser?: string) {
  const rows = await db()`
    with a as (
      select u.id,
        coalesce(nullif(u.gender, ''), case l.gender when '여자' then 'female' when '남자' then 'male' end) as g,
        (u.role_pref in ('driver', 'both') or (u.role_pref = '' and (u.car_no <> '' or l.kind = '드라이버'
          or exists (select 1 from posts p where p.user_id = u.id and p.role = 'driver')))) as is_driver,
        (u.role_pref in ('rider', 'both') or (u.role_pref = '' and (l.kind = '라이더'
          or exists (select 1 from posts p where p.user_id = u.id and p.role = 'rider')))) as is_rider
      from users u
      left join lateral (select gender, kind from legacy_members m where m.matched_user = u.id limit 1) l on true
      where not u.blocked and (${onlyUser ?? null}::uuid is null or u.id = ${onlyUser ?? null}::uuid))
    select id from a
    where (cardinality(${roles}::text[]) = 0 or ('driver' = any(${roles}::text[]) and is_driver) or ('rider' = any(${roles}::text[]) and is_rider))
      and (cardinality(${genders}::text[]) = 0 or g = any(${genders}::text[]))`;
  return rows.map((r) => String(r.id));
}

export const targetLabel = (roles: string[], genders: string[]) => {
  const r = roles.map((x) => (x === "driver" ? "운전자" : "탑승자")).join("·");
  const g = genders.map((x) => (x === "female" ? "여성" : "남성")).join("·");
  return [g, r].filter(Boolean).join(" ") || "전체 회원";
};
