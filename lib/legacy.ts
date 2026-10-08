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

/** 새로 가입한 회원이 구 워프 회원이면 바로 '가입됨'으로 바꾼다. */
export async function matchNewUser(userId: string, email: string) {
  const e = normEmail(email);
  if (!e) return;
  await db()`update legacy_members set match_status = '가입됨', matched_user = ${userId}, matched_by = '이메일'
             where email_norm = ${e} or email_h = ${keyedHash(e)}`;
}
