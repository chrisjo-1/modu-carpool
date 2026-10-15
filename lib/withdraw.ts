import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { keyedHash, normEmail } from "./legacy";
import { db } from "./server";

/**
 * 탈퇴 상태 확인(메일 주소 기준).
 * - state: active(이용 중 계정 또는 워프 행이 하나라도 있음) / withdrawn(찾은 것이 모두 탈퇴) / none(가입 이력 없음)
 * - account: 이 메일로 이용 중인 가입 계정이 있는지(개인정보만 삭제는 계정이 있어야 가능)
 */
export type WithdrawStatus = { state: "active" | "withdrawn" | "none"; account: boolean };

export async function withdrawStatus(email: string): Promise<WithdrawStatus> {
  const e = normEmail(email);
  if (!e) return { state: "none", account: false };
  const sql = db();
  const u = await sql`select withdrawn_at from users where email = ${e}`;
  const l = await sql`select coalesce(withdrawn, false) as w from legacy_members where email_norm = ${e} or email_h = ${keyedHash(e)}`;
  const account = u.length > 0 && !u[0].withdrawn_at;
  const activeCount = (account ? 1 : 0) + l.filter((r) => !r.w).length;
  const withdrawnCount = (u.length > 0 && u[0].withdrawn_at ? 1 : 0) + l.filter((r) => r.w).length;
  const state = activeCount > 0 ? "active" : withdrawnCount > 0 ? "withdrawn" : "none";
  return { state, account };
}

/**
 * 개인정보 삭제(이메일만 남긴다): 이름·전화·연락처·SNS 아이디·소개·사진·차량·위치·출퇴근 경로.
 * 가입 회원과 워프 행 모두 적용한다. 이메일 주소와 계정(또는 워프 행)은 그대로 둔다.
 */
async function clearPersonal(email: string) {
  const sql = db();
  await sql`update users set old_name = null, bio = '', contact = '', contact_type = '', photo = '', photo_v = 0,
    car_no = '', car_photo = '', car_v = 0, gender = '', loc_lat = null, loc_lng = null, loc_at = null,
    commute_origin = '', commute_dest = '', commute_olat = null, commute_olng = null, commute_dlat = null, commute_dlng = null, commute_time = ''
    where email = ${email}`;
  await sql`update legacy_members set name = null, nickname = null, gender = null, phone = null, phone_norm = null, phone_h = null,
    naver_id = null, kakao_id = null, memo = ''
    where email_norm = ${email} or email_h = ${keyedHash(email)}`;
}

/** 탈퇴 처리: 개인정보를 지우고, 계정은 탈퇴 시각을 남겨 로그인·글 노출을 막는다. 워프 행도 탈퇴로 표시한다. */
export async function performWithdraw(email: string) {
  const e = normEmail(email);
  if (!e) return;
  await clearPersonal(e);
  const sql = db();
  await sql`update users set withdrawn_at = coalesce(withdrawn_at, now()) where email = ${e}`;
  await sql`update legacy_members set withdrawn = true, withdrawn_at = coalesce(withdrawn_at, now())
    where (email_norm = ${e} or email_h = ${keyedHash(e)}) and not coalesce(withdrawn, false)`;
}

/**
 * 계속 이용: 개인정보만 지우고 계정은 유지한다. 기존 비밀번호는 쓸 수 없게 바꾸고,
 * 로그인 중인 기기도 모두 끊는다. 새 비밀번호는 '비밀번호 찾기'로 정해야 한다.
 */
export async function performPurgeInfo(email: string) {
  const e = normEmail(email);
  if (!e) return;
  await clearPersonal(e);
  const sql = db();
  const unusable = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  await sql`update users set pw = ${unusable}, pw_reset_required = true, pw_at = date_trunc('second', now()) + interval '1 second'
    where email = ${e} and withdrawn_at is null`;
}

export const hashWithdrawToken = (t: string) => createHash("sha256").update(t).digest("hex");
