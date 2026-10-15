import { createHmac, timingSafeEqual } from "node:crypto";
import { db, ensureSchema } from "./server";
import { SITE_URL as SITE } from "./site";

/** 수신거부 링크 서명. 비밀 키(SESSION_SECRET)가 있어야 만들 수 있어, 아무 주소나 거부 처리할 수 없다. */
const sign = (email: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`unsub:${email}`).digest("hex");

export const unsubToken = (email: string) => {
  const e = email.trim().toLowerCase();
  return `${Buffer.from(e).toString("base64url")}.${sign(e)}`;
};

export function emailFromToken(t: string): string | null {
  const [b, s] = t.split(".");
  if (!b || !s || !process.env.SESSION_SECRET) return null;
  const email = Buffer.from(b, "base64url").toString("utf8");
  const a = Buffer.from(s);
  const e = Buffer.from(sign(email));
  return a.length === e.length && timingSafeEqual(a, e) ? email : null;
}

export const unsubUrl = (email: string) => `${SITE}/api/unsubscribe?t=${unsubToken(email)}`;

/** 광고 수신 동의 변경을 기록한다(언제, 누가, 어디서 바꿨는지 증명용). */
export async function logConsent(userId: string | null, email: string, on: boolean, source: string) {
  await ensureSchema();
  await db()`insert into marketing_consent_log (user_id, email, action, source) values (${userId}, ${email.trim().toLowerCase()}, ${on ? "grant" : "revoke"}, ${source})`;
}

/** 발송 제외 주소로 등록하고, 가입 회원이면 광고 동의도 끈다(동의 철회 기록 포함). */
export async function suppress(email: string, reason: string) {
  const e = email.trim().toLowerCase();
  await ensureSchema();
  await db()`insert into mail_suppressions (email, reason) values (${e}, ${reason})
    on conflict (email) do update set reason = excluded.reason, created_at = now()`;
  const u = await db()`update users set marketing = false, marketing_at = now() where lower(email) = ${e} and marketing returning id`;
  if (u.length) await logConsent(String(u[0].id), e, false, reason);
}

/** 광고성 메일을 보내면 안 되는 이유(발송 제외 주소, 정지·테스트·탈퇴 회원). 보내도 되면 빈 문자열. */
export async function suppressedNow(email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  await ensureSchema();
  const s = await db()`select 1 from mail_suppressions where email = ${e}`;
  if (s.length) return "발송 제외 주소(수신거부·반송·스팸 신고)";
  const u = await db()`select blocked, test, withdrawn_at from users where lower(email) = ${e}`;
  if (u[0] && (u[0].blocked === true || u[0].test === true || u[0].withdrawn_at)) return "정지·테스트·탈퇴 회원";
  return "";
}
