import { randomBytes } from "node:crypto";
import { maskEmail, normEmail } from "@/lib/legacy";
import { sendWithdrawConfirmMail, siteUrl } from "@/lib/mail";
import { body, clientIp, db, ensureSchema, fail, json, overLimit, recordAttempt } from "@/lib/server";
import { hashWithdrawToken, performWithdraw, withdrawState } from "@/lib/withdraw";

export const dynamic = "force-dynamic";

/**
 * 탈퇴 창구(워프 기존 회원·모두의카풀 가입 회원 공통).
 * - check: 메일 주소로 탈퇴 상태만 알려 준다.
 * - request: 탈퇴 상태가 '이용 중'이면 그 메일로 확인 링크를 보낸다.
 * - confirm: 확인 링크를 누르면 탈퇴 처리한다.
 */
export async function POST(req: Request) {
  const b = await body(req);
  try {
    await ensureSchema();
    if (b.action === "check") return check(req, b);
    if (b.action === "request") return request(req, b);
    if (b.action === "confirm") return confirm(b);
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}

async function check(req: Request, b: Record<string, unknown>) {
  const email = normEmail(b.email);
  if (!email) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  const ip = clientIp(req);
  if (await overLimit("withdraw-ip", ip, 10, 60)) return json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  await recordAttempt("withdraw-ip", ip);
  return json({ state: await withdrawState(email) });
}

async function request(req: Request, b: Record<string, unknown>) {
  const email = normEmail(b.email);
  if (!email) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  const ip = clientIp(req);
  if (await overLimit("withdraw-req-ip", ip, 10, 60)) return json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  if ((await withdrawState(email)) !== "active") return json({ error: "지금 탈퇴 신청할 수 있는 계정이 아니에요." }, 400);
  if (await overLimit("withdraw-mail", email, 3, 60)) return json({ error: "확인 메일은 1시간에 3번까지 보낼 수 있어요." }, 429);
  await recordAttempt("withdraw-req-ip", ip);
  await recordAttempt("withdraw-mail", email);
  const token = randomBytes(32).toString("hex");
  await db()`insert into withdraw_claims (token_hash, email_norm, expires_at) values (${hashWithdrawToken(token)}, ${email}, now() + interval '72 hours')`;
  const sent = await sendWithdrawConfirmMail(email, `${siteUrl()}/?withdraw=${token}`).catch(() => false);
  if (!sent) return json({ error: "확인 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요." }, 503);
  return json({ ok: true, sentTo: maskEmail(email) });
}

async function confirm(b: Record<string, unknown>) {
  const token = typeof b.token === "string" && /^[a-f0-9]{64}$/.test(b.token) ? b.token : "";
  if (!token) return json({ error: "링크가 올바르지 않아요." }, 400);
  const c = await db()`update withdraw_claims set used = true
    where token_hash = ${hashWithdrawToken(token)} and not used and expires_at > now() returning email_norm`;
  if (!c.length) return json({ error: "링크가 만료되었거나 이미 사용되었어요. 탈퇴 여부를 다시 확인해 주세요." }, 400);
  await performWithdraw(String(c[0].email_norm));
  return json({ ok: true });
}
