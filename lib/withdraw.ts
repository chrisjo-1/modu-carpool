import { createHash } from "node:crypto";
import { keyedHash, normEmail } from "./legacy";
import { db } from "./server";

/**
 * 탈퇴 상태 확인(메일 주소 기준).
 * - active: 탈퇴하지 않은 계정 또는 워프 행이 하나라도 있다.
 * - withdrawn: 찾은 계정·워프 행이 모두 탈퇴 상태다.
 * - none: 가입 이력이 없다.
 * 워프 탈퇴 행은 메일 주소 해시로 찾는다(탈퇴 행은 해시만 남은 경우가 있다).
 */
export type WithdrawState = "active" | "withdrawn" | "none";

export async function withdrawState(email: string): Promise<WithdrawState> {
  const e = normEmail(email);
  if (!e) return "none";
  const sql = db();
  const u = await sql`select withdrawn_at from users where email = ${e}`;
  const l = await sql`select coalesce(withdrawn, false) as w from legacy_members where email_norm = ${e} or email_h = ${keyedHash(e)}`;
  const activeCount = (u.length && !u[0].withdrawn_at ? 1 : 0) + l.filter((r) => !r.w).length;
  const withdrawnCount = (u.length && u[0].withdrawn_at ? 1 : 0) + l.filter((r) => r.w).length;
  if (activeCount > 0) return "active";
  if (withdrawnCount > 0) return "withdrawn";
  return "none";
}

/**
 * 탈퇴 처리: 가입 계정은 탈퇴 시각만 남기고 로그인·글 노출을 막는다.
 * 워프 행도 탈퇴로 표시한다. 메일 주소는 그대로 둔다. 나머지 개인정보 삭제는 추후 작업이다.
 */
export async function performWithdraw(email: string) {
  const e = normEmail(email);
  if (!e) return;
  const sql = db();
  await sql`update users set withdrawn_at = coalesce(withdrawn_at, now()) where email = ${e}`;
  await sql`update legacy_members set withdrawn = true, withdrawn_at = coalesce(withdrawn_at, now())
    where (email_norm = ${e} or email_h = ${keyedHash(e)}) and not coalesce(withdrawn, false)`;
}

export const hashWithdrawToken = (t: string) => createHash("sha256").update(t).digest("hex");
