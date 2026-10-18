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
        (u.role_pref in ('driver') or (u.role_pref = '' and (u.car_no <> '' or l.kind = '드라이버'
          or exists (select 1 from posts p where p.user_id = u.id and p.role = 'driver')))) as is_driver,
        (u.role_pref in ('rider') or (u.role_pref = '' and (l.kind = '라이더'
          or exists (select 1 from posts p where p.user_id = u.id and p.role = 'rider')))) as is_rider
      from users u
      left join lateral (select gender, kind from legacy_members m where m.matched_user = u.id limit 1) l on true
      -- 비밀번호 설정을 마친 회원만(구 워프에서 옮겨 와 아직 비밀번호를 정하지 않은 회원·탈퇴 회원 제외)
      where not u.blocked and not u.pw_reset_required and u.withdrawn_at is null and (${onlyUser ?? null}::uuid is null or u.id = ${onlyUser ?? null}::uuid))
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

export const NOTICE_KINDS = ["notice", "push", "both"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
export const KIND_LABEL: Record<NoticeKind, string> = { notice: "공지만", push: "푸시만", both: "공지+푸시" };

/**
 * 대상 인원과 푸시 받을 회원을 DB 안에서 한 번에 센다(회원 id 목록을 주고받지 않는다).
 * withList 면 푸시 받을 회원 id 목록도 돌려준다.
 */
export async function targetSummary(roles: string[], genders: string[], withList = false) {
  const rows = await db()`
    with a as (
      select u.id,
        coalesce(nullif(u.gender, ''), case l.gender when '여자' then 'female' when '남자' then 'male' end) as g,
        (u.role_pref in ('driver') or (u.role_pref = '' and (u.car_no <> '' or l.kind = '드라이버'
          or exists (select 1 from posts p where p.user_id = u.id and p.role = 'driver')))) as is_driver,
        (u.role_pref in ('rider') or (u.role_pref = '' and (l.kind = '라이더'
          or exists (select 1 from posts p where p.user_id = u.id and p.role = 'rider')))) as is_rider
      from users u
      left join lateral (select gender, kind from legacy_members m where m.matched_user = u.id limit 1) l on true
      -- 비밀번호 설정을 마친 회원만(구 워프에서 옮겨 와 아직 비밀번호를 정하지 않은 회원·탈퇴 회원 제외)
      where not u.blocked and not u.pw_reset_required and u.withdrawn_at is null),
    t as (
      select id from a
      where (cardinality(${roles}::text[]) = 0 or ('driver' = any(${roles}::text[]) and is_driver) or ('rider' = any(${roles}::text[]) and is_rider))
        and (cardinality(${genders}::text[]) = 0 or g = any(${genders}::text[]))),
    s as (select s.user_id from push_subs s join t on t.id = s.user_id)
    select (select count(*)::int from t) as members,
           (select count(distinct user_id)::int from s) as push_members,
           (select count(*)::int from s) as devices,
           case when ${withList} then (select coalesce(array_agg(distinct user_id::text), '{}') from s) else '{}'::text[] end as push_ids`;
  const r = rows[0];
  return { members: Number(r.members), pushMembers: Number(r.push_members), devices: Number(r.devices), pushIds: (r.push_ids as string[]) ?? [] };
}
