import { createHash, randomBytes } from "node:crypto";
import { sendVerifyMail, siteUrl } from "./mail";
import { db } from "./server";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** 인증 메일 보내기. 1시간에 3번까지 */
export async function startVerify(userId: string, email: string): Promise<"sent" | "limited" | "nomail"> {
  const sql = db();
  const n = await sql`select count(*)::int as n from email_verifications where user_id = ${userId} and created_at > now() - interval '1 hour'`;
  if ((n[0].n as number) >= 3) return "limited";
  const token = randomBytes(32).toString("hex");
  await sql`insert into email_verifications (token_hash, user_id, expires_at) values (${hash(token)}, ${userId}, now() + interval '24 hours')`;
  const ok = await sendVerifyMail(email, `${siteUrl()}/?verify=${token}`);
  return ok ? "sent" : "nomail";
}

/** 링크의 토큰으로 인증 완료. 성공하면 회원 id */
export async function finishVerify(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const sql = db();
  const rows = await sql`delete from email_verifications where token_hash = ${hash(token)} and expires_at > now() returning user_id`;
  if (!rows.length) return null;
  const id = String(rows[0].user_id);
  await sql`update users set email_verified = true where id = ${id}`;
  await sql`delete from email_verifications where user_id = ${id}`;
  return id;
}

/** 인증이 필요한 동작 앞에서 확인 */
export async function isVerified(userId: string) {
  const r = await db()`select email_verified from users where id = ${userId}`;
  return !!r[0]?.email_verified;
}
