import { createHmac } from "node:crypto";
import { db } from "./server";

/** 대조용 정규화: 이메일은 공백 제거·소문자, 휴대폰은 숫자만(010으로 시작하는 10~11자리) */
export const normEmail = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
};
export const normPhone = (v: unknown) => {
  let d = typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "";
  if (d.startsWith("82")) d = "0" + d.slice(2);
  return /^01\d{8,9}$/.test(d) ? d : "";
};

/** 탈퇴 회원용 해시. 비밀 키가 있어야 같은 값을 만들 수 있어 휴대폰 번호를 거꾸로 맞춰 볼 수 없다. */
export function keyedHash(v: string) {
  const key = process.env.LEGACY_HASH_KEY || process.env.SESSION_SECRET || "";
  return v ? createHmac("sha256", key).update(v).digest("hex") : "";
}

/** 화면 표시용 가림 */
export const maskEmail = (e: string | null) => {
  if (!e) return "";
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(u.length - 2, 6)))}@${d ?? ""}`;
};
export const maskPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : d ? "****" : "";
};

/**
 * 현재 모두의카풀 회원과 구 워프 회원을 대조한다(정확 일치만).
 * 이메일은 가입 이메일, 휴대폰은 연락 수단을 '전화번호'로 등록한 회원의 번호와 비교한다.
 */
export async function runMatch() {
  const sql = db();
  const users = await sql`select id, email, contact, contact_type from users where not test`;
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const u of users) {
    const e = normEmail(u.email);
    if (e) {
      byEmail.set(e, String(u.id));
      byEmail.set("h:" + keyedHash(e), String(u.id));
    }
    const p = u.contact_type === "phone" ? normPhone(u.contact) : "";
    if (p) {
      byPhone.set(p, String(u.id));
      byPhone.set("h:" + keyedHash(p), String(u.id));
    }
  }
  const rows = await sql`select warp_id, email_norm, phone_norm, email_h, phone_h from legacy_members`;
  const ids: string[] = [], st: string[] = [], who: (string | null)[] = [], by: (string | null)[] = [];
  let joined = 0;
  for (const r of rows) {
    const e = (r.email_norm && byEmail.get(String(r.email_norm))) || (r.email_h && byEmail.get("h:" + r.email_h)) || null;
    const p = (r.phone_norm && byPhone.get(String(r.phone_norm))) || (r.phone_h && byPhone.get("h:" + r.phone_h)) || null;
    const user = e || p;
    ids.push(String(r.warp_id));
    st.push(user ? "가입됨" : "미가입");
    who.push(user);
    by.push(e && p ? "이메일+휴대폰" : e ? "이메일" : p ? "휴대폰" : null);
    if (user) joined++;
  }
  for (let i = 0; i < ids.length; i += 5000) {
    await sql`update legacy_members l set match_status = v.st, matched_user = v.who::uuid, matched_by = v.by
      from (select unnest(${ids.slice(i, i + 5000)}::text[]) as id, unnest(${st.slice(i, i + 5000)}::text[]) as st,
                   unnest(${who.slice(i, i + 5000)}::text[]) as who, unnest(${by.slice(i, i + 5000)}::text[]) as by) v
      where l.warp_id = v.id`;
  }
  return { total: rows.length, joined };
}

/**
 * 가입 때 쓰는 워프 확인: 워프 고유번호(8자리) 또는 워프에 등록된 이메일로 아직 연결되지 않은 구 워프 회원을 찾는다.
 * 탈퇴 회원과 이미 다른 계정에 연결된 회원은 찾지 않는다.
 */
export async function findLegacyByKey(key: string): Promise<{ warpId: string; by: "번호입력" | "이메일" } | null> {
  const raw = key.trim();
  if (!raw) return null;
  const sql = db();
  if (/^[0-9A-Za-z]{8}$/.test(raw)) {
    const r = await sql`select warp_id from legacy_members where upper(warp_id) = ${raw.toUpperCase()} and matched_user is null and not coalesce(withdrawn, false) limit 1`;
    return r.length ? { warpId: String(r[0].warp_id), by: "번호입력" } : null;
  }
  const e = normEmail(raw);
  if (!e) return null;
  const r = await sql`select warp_id from legacy_members where (email_norm = ${e} or email_h = ${keyedHash(e)}) and matched_user is null and not coalesce(withdrawn, false) limit 1`;
  return r.length ? { warpId: String(r[0].warp_id), by: "이메일" } : null;
}

/**
 * 워프 고유번호가 '한 번도 쓰지 않은 임시 계정'(비번 미설정·접속 없음)에 묶여 있으면 그 번호를 돌려준다(2026-11-17 사용자 지시:
 * 워프 메일로 로그인이 안 되는 회원은 바로 확인할 수 있는 메일로 새로 가입하고 워프 고유번호를 넣으면, 확인 뒤 크레딧을 옮겨 준다).
 * 번호만으로는 본인 확인이 안 되므로 가입 때 바로 잇지 않고, 크레딧 이관 신청을 관리자가 확인해 지급할 때 옮긴다(takeoverWarp).
 */
export async function findTempHeldCode(key: string): Promise<string | null> {
  const raw = key.trim().toUpperCase();
  if (!/^[0-9A-Z]{8}$/.test(raw)) return null;
  const r = await db()`select l.warp_id from legacy_members l join users u on u.id = l.matched_user
    where upper(l.warp_id) = ${raw} and not coalesce(l.withdrawn, false) and u.pw_reset_required and u.last_seen is null limit 1`;
  return r.length ? String(r[0].warp_id) : null;
}

/**
 * 크레딧 이관 지급 때: 그 고유번호의 워프 명단을 신청한 계정으로 옮긴다.
 * 비어 있으면 연결, 쓰지 않은 임시 계정에 묶여 있으면 그 계정의 글(워프에서 옮긴 글 등)을 새 계정으로 옮기고 임시 계정은 닫는다.
 * 실제로 쓰는 다른 계정에 묶여 있으면 옮기지 않고 conflict.
 */
export async function takeoverWarp(code: string, userId: string): Promise<"linked" | "moved" | "same" | "conflict" | "none"> {
  const sql = db();
  const c = code.trim().toUpperCase();
  if (!c) return "none";
  const l = await sql`select warp_id, matched_user from legacy_members where upper(warp_id) = ${c} and not coalesce(withdrawn, false) limit 1`;
  if (!l.length) return "none";
  const owner = l[0].matched_user ? String(l[0].matched_user) : "";
  if (owner === userId) return "same";
  if (!owner) {
    await sql`update legacy_members set matched_user = ${userId}, match_status = '가입됨', matched_by = '크레딧 이관 확인' where warp_id = ${l[0].warp_id} and matched_user is null`;
    return "linked";
  }
  const t = await sql`select id from users where id = ${owner} and pw_reset_required and last_seen is null`;
  if (!t.length) return "conflict";
  await sql`update posts set user_id = ${userId} where user_id = ${owner}`;
  await sql`update legacy_members set matched_user = ${userId}, matched_by = '크레딧 이관 확인(임시 계정에서 옮김)' where matched_user = ${owner}`;
  await sql`delete from kakao_links where user_id = ${owner}`;
  // 임시 계정은 닫기만 한다(개인정보 삭제 처리 performWithdraw는 워프 명단까지 지우므로 쓰지 않음)
  await sql`update users set withdrawn_at = now() where id = ${owner} and withdrawn_at is null`;
  return "moved";
}

/**
 * 워프에서 탈퇴했다가 다시 가입한 회원(2026-11-17, 0693550C): 예전 고유번호가 워프 탈퇴로 표시될 때 같은 메일의 '한 번도 안 쓴 임시 계정'이
 * 함께 닫혔는데, 같은 메일로 새 고유번호가 명단에 올라오면 그 닫힌 계정에 묶여 '탈퇴·정지'로 보였다.
 * 이 명단 행이 탈퇴가 아니고, 묶인 계정이 한 번도 쓰지 않은 임시 계정(비번 미설정·접속 없음·정지 아님)이면 계정을 다시 열고 고유코드를 새 번호로 바꾼다.
 */
export async function reviveRejoined(userId: string, warpId: string): Promise<boolean> {
  const code = warpId.trim().toUpperCase();
  const r = await db()`update users u set withdrawn_at = null,
      member_code = case when exists (select 1 from users o where o.member_code = ${code} and o.id <> u.id) then u.member_code else ${code} end
    where u.id = ${userId} and u.withdrawn_at is not null and u.pw_reset_required and u.last_seen is null and not u.blocked
      and exists (select 1 from legacy_members l where l.matched_user = u.id and upper(l.warp_id) = ${code} and not coalesce(l.withdrawn, false))
    returning u.id`;
  return r.length > 0;
}
