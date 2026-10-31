import { after } from "next/server";
import { features } from "@/lib/features";
import { migrateWarpPools } from "@/lib/warpPool";
import { grantCarIfReady } from "@/lib/car";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { charge, getRules, grant, grantLegacy } from "@/lib/credits";
import { finishVerify, startVerify } from "@/lib/verify";
import { sendLegacyConfirmMail, sendVerifyMail } from "@/lib/mail";
import { isUniqueViolation, makeMemberCode } from "@/lib/memberCode";
import { sendResetMail, siteUrl } from "@/lib/mail";
import { findLegacyByKey, maskEmail, normEmail } from "@/lib/legacy";
import { logConsent } from "@/lib/unsub";
import { CONTACT_TYPES, JOIN_SOURCES, driverTier } from "@/lib/types";
import { authEnabled, body, clearCookie, clientIp, overLimit, recordAttempt, currentUserId, db, ensureSchema, fail, json, needLogin, carPhotoUrl, photoUrl, setUserSession, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 관리자 메일(Vercel 환경변수 ADMIN_EMAILS, 쉼표로 구분)로 로그인한 회원인지. */
function isAdminEmail(email: unknown) {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  return typeof email === "string" && list.includes(email.toLowerCase());
}

async function profile(id: string) {
  const rows = await db()`select email, member_code, name, bio, contact, contact_type, photo_v, test, notify, car_no, car_v, tier_set, gender, role_pref, email_verified, terms_at, marketing, interests from users where id = ${id}`;
  return rows.length ? { id, email: rows[0].email, memberCode: rows[0].member_code ?? "", name: rows[0].name, bio: rows[0].bio, contact: rows[0].contact, contactType: rows[0].contact_type, photo: photoUrl(id, rows[0].photo_v), test: rows[0].test === true, notify: rows[0].notify !== false, carNo: rows[0].car_no ?? "", carPhoto: carPhotoUrl(id, rows[0].car_v), tier: driverTier({ carNo: rows[0].car_no ?? "", carPhoto: carPhotoUrl(id, rows[0].car_v), photo: photoUrl(id, rows[0].photo_v), tierSet: rows[0].tier_set }), gender: rows[0].gender ?? "", rolePref: rows[0].role_pref ?? "", verified: rows[0].email_verified !== false, consented: !!rows[0].terms_at, marketing: rows[0].marketing === true, interests: rows[0].interests ?? null, photoZoom: isAdminEmail(rows[0].email) } : null;
}

export async function GET() {
  if (!authEnabled()) return json({ enabled: false, user: null });
  try {
    const id = await currentUserId();
    if (!id) return json({ enabled: true, user: null, ...(await features()) });
    await ensureSchema();
    const [user, f] = await Promise.all([profile(id), features()]);
    // 워프 정기카풀이 이 계정 고유번호로 저장돼 있으면 정기카풀 글로 옮긴다(응답 뒤, 한 번만)
    after(() => migrateWarpPools(id).catch(() => 0));
    return json({ enabled: true, user, ...f });
  } catch {
    return json({ enabled: true, user: null });
  }
}

export async function POST(req: Request) {
  if (!authEnabled()) return json({ error: "로그인 기능이 아직 준비 중입니다." }, 503);
  const b = await body(req);
  if (b.action === "reset") return resetPassword(b);
  if (b.action === "changePassword") return changePassword(b);
  if (b.action === "verify") return verifyEmail(b);
  if (b.action === "legacyConfirm") return legacyConfirm(b);
  if (b.action === "legacyChange") return legacyChange(b);
  if (b.action === "resendVerify" || b.action === "consent" || b.action === "interests") return accountAction(b);
  const email = text(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  if (b.action === "forgot") return forgot(req, email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "비밀번호는 8자 이상이어야 합니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const ip = clientIp(req);
    if (b.action === "signup") {
      // 같은 곳에서 1시간에 5번까지 가입
      if (await overLimit("signup-ip", ip, 5, 60)) return json({ error: "가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
      // 닉네임은 가입 때 묻지 않는다. 입력이 있으면 쓰고, 없으면 이메일 앞부분으로 정한다(내 정보에서 바꿀 수 있다).
      const name = text(b.name, 20) || defaultNickname(email);
      if (b.terms !== true || b.privacy !== true) return json({ error: "이용약관과 개인정보 수집·이용에 동의해 주세요." }, 400);
      const joinSource = JOIN_SOURCES.some(([k]) => k === b.joinSource) ? String(b.joinSource) : "";
      if (!joinSource) return json({ error: "가입 경로를 골라 주세요." }, 400);
      // 워프(풀럭) 기존 회원은 워프 고유번호 또는 워프에 쓴 이메일로 확인한다(이메일 인증 뒤 한 번만 이전 크레딧 지급).
      const warpKey = joinSource === "warp" ? text(b.warpKey, 120) : "";
      if (joinSource === "warp") {
        if (!warpKey) return json({ error: "워프 고유번호(8자리) 또는 워프에 쓴 이메일을 입력해 주세요." }, 400);
        if (!(await findLegacyByKey(warpKey))) return json({ error: "워프 명단에서 찾을 수 없거나 이미 사용된 번호·이메일이에요. 다시 확인해 주세요." }, 400);
      }
      // 가입 때 위치는 받지 않는다. 위치가 필요한 기능(CALL, 운전자 글)을 쓸 때 권한을 요청한다.
      const la = b.lat == null || b.lng == null ? null : Math.round(Number(b.lat) * 1e4) / 1e4;
      const ln = b.lat == null || b.lng == null ? null : Math.round(Number(b.lng) * 1e4) / 1e4;
      const locOk = la != null && ln != null && Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
      const exists = await sql`select 1 from users where email = ${email}`;
      if (exists.length) return json({ error: "이미 가입된 이메일입니다." }, 409);
      // 인증 메일은 1분에 한 번만 다시 보낸다.
      const prev = await sql`select created_at from pending_signups where email = ${email}`;
      if (prev.length && Date.now() - new Date(String(prev[0].created_at)).getTime() < 60_000)
        return json({ error: "인증 메일은 1분 뒤에 다시 보낼 수 있어요." }, 429);
      await recordAttempt("signup-ip", ip);
      const hash = await bcrypt.hash(password, 10);
      const token = randomBytes(32).toString("hex");
      const mkt = b.marketing === true;
      // 이메일 인증을 마치기 전에는 계정을 만들지 않는다. 임시 가입 정보만 둔다.
      await sql`insert into pending_signups (email, pw, name, notify, marketing, token_hash, ip, expires_at, loc_lat, loc_lng, join_source, legacy_key)
        values (${email}, ${hash}, ${name}, ${b.notify !== false}, ${mkt}, ${hashToken(token)}, ${ip}, now() + interval '24 hours', ${locOk ? la : null}, ${locOk ? ln : null}, ${joinSource}, ${warpKey})
        on conflict (email) do update set pw = excluded.pw, name = excluded.name, notify = excluded.notify, marketing = excluded.marketing,
          token_hash = excluded.token_hash, ip = excluded.ip, created_at = now(), expires_at = excluded.expires_at,
          loc_lat = excluded.loc_lat, loc_lng = excluded.loc_lng, join_source = excluded.join_source, legacy_key = excluded.legacy_key`;
      const sent = await sendVerifyMail(email, `${siteUrl()}/?verify=${token}`).catch(() => false);
      if (!sent) {
        await sql`delete from pending_signups where email = ${email}`;
        return json({ error: "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요." }, 503);
      }
      return json({ pending: true });
    }
    if (b.action === "login") {
      // 비밀번호 무차별 대입 방지: 같은 이메일 15분에 10번, 같은 곳 15분에 30번 틀리면 잠깐 막는다.
      if ((await overLimit("login-email", email, 10, 15)) || (await overLimit("login-ip", ip, 30, 15)))
        return json({ error: "로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도하거나 비밀번호 찾기를 이용해 주세요." }, 429);
      const rows = await sql`select id, pw, blocked, withdrawn_at, pw_reset_required from users where email = ${email}`;
      const ok = rows.length > 0 && (await bcrypt.compare(password, String(rows[0].pw)));
      if (!ok) {
        await recordAttempt("login-email", email);
        await recordAttempt("login-ip", ip);
        if (rows.length && rows[0].pw_reset_required) return json({ error: "아직 비밀번호가 정해지지 않은 계정이에요. 비밀번호 찾기로 새 비밀번호를 정해 주세요." }, 403);
        return json({ error: "이메일 또는 비밀번호가 맞지 않습니다." }, 401);
      }
      if (rows[0].blocked) return json({ error: "이용이 정지된 계정입니다. 문의가 필요하면 운영자에게 연락해 주세요." }, 403);
      if (rows[0].withdrawn_at) return json({ error: "탈퇴 처리된 계정이에요." }, 403);
      await setUserSession(String(rows[0].id));
      return json({ user: await profile(String(rows[0].id)) });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}


/**
 * 인증 링크의 토큰으로 임시 가입 정보를 찾아 계정을 만든다.
 * 성공하면 회원 id와 지급 크레딧, 이미 가입된 이메일이면 "taken", 링크가 아니면 null.
 */
async function createFromPending(token: string): Promise<{ id: string; welcome: number; legacy: number; legacyPending: boolean } | "taken" | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const sql = db();
  const rows = await sql`delete from pending_signups where token_hash = ${hashToken(token)} and expires_at > now()
    returning email, pw, name, notify, marketing, loc_lat, loc_lng, join_source, legacy_key`;
  if (!rows.length) return null;
  const p = rows[0];
  const email = String(p.email);
  if ((await sql`select 1 from users where email = ${email}`).length) return "taken";
  const mkt = p.marketing === true;
  // 고유코드는 가입과 동시에 자동 배정한다. 겹치면 다시 뽑는다.
  // 닉네임은 쓰지 않는다. 표시 이름도 고유코드로 둔다.
  let ins: Record<string, unknown>[] | null = null;
  for (let i = 0; i < 10 && !ins; i++) {
    const code = makeMemberCode();
    try {
      ins = await sql`insert into users (email, pw, name, notify, email_verified, terms_at, marketing, marketing_at, member_code, loc_lat, loc_lng, loc_at, join_source)
        values (${email}, ${String(p.pw)}, ${code}, ${p.notify === true}, true, now(), ${mkt}, ${mkt ? new Date().toISOString() : null}, ${code},
          ${p.loc_lat == null ? null : Number(p.loc_lat)}, ${p.loc_lng == null ? null : Number(p.loc_lng)}, ${p.loc_lat == null ? null : new Date().toISOString()}, ${String(p.join_source ?? "")}) returning id`;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  if (!ins) throw new Error("고유코드를 배정하지 못했습니다.");
  const id = String(ins[0].id);
  if (mkt) await logConsent(id, email, true, "signup").catch(() => {});
  const welcome = await grant(id, "signup").catch(() => 0);
  // 가입 경로가 워프(풀럭) 기존 회원이면 이전 축하 크레딧을 준다.
  // 고유번호이거나 가입 이메일과 워프 이메일이 같으면 바로 연결한다. 다른 워프 이메일이면 그 주소로 확인 링크를 보내고, 눌러야 연결·지급한다.
  let legacy = 0;
  let legacyPending = false;
  const key = String(p.legacy_key ?? "");
  const hit = String(p.join_source) === "warp" && key ? await findLegacyByKey(key) : null;
  if (hit && (hit.by === "번호입력" || normEmail(email) === normEmail(key))) {
    legacy = await claimLegacy(id, hit.warpId, hit.by);
  } else if (hit) {
    const token = randomBytes(32).toString("hex");
    await sql`insert into legacy_claims (token_hash, user_id, warp_id, expires_at) values (${hashToken(token)}, ${id}, ${hit.warpId}, now() + interval '72 hours')`;
    await sendLegacyConfirmMail(key, `${siteUrl()}/?legacy=${token}`).catch(() => false);
    legacyPending = true;
  }
  await setUserSession(id);
  return { id, welcome, legacy, legacyPending };
}

/** 워프 대조 행을 이 회원에게 연결하고, 처음이면 이전 축하 크레딧을 준다. 다른 회원이 이미 쓴 행이면 0. */
async function claimLegacy(userId: string, warpId: string, by: string): Promise<number> {
  const claimed = await db()`update legacy_members set matched_user = ${userId}, match_status = '가입됨', matched_by = ${by}
    where warp_id = ${warpId} and matched_user is null returning warp_id`;
  return claimed.length ? grant(userId, "legacy").catch(() => 0) : 0;
}

/** 워프 이메일 확인 링크를 눌렀을 때: 링크를 만든 회원에게 연결하고 이전 축하 크레딧을 한 번 준다. */
async function legacyConfirm(b: Record<string, unknown>) {
  const token = typeof b.token === "string" && /^[a-f0-9]{64}$/.test(b.token) ? b.token : "";
  if (!token) return json({ error: "링크가 올바르지 않습니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const c = await sql`select user_id, warp_id from legacy_claims where token_hash = ${hashToken(token)} and not used and expires_at > now()`;
    if (!c.length) return json({ error: "확인 링크가 만료되었거나 이미 사용되었습니다. 내 정보의 크레딧에서 다시 받아 주세요." }, 400);
    const legacy = await claimLegacy(String(c[0].user_id), String(c[0].warp_id), "이메일");
    await sql`update legacy_claims set used = true where token_hash = ${hashToken(token)}`;
    if (!legacy) return json({ error: "이미 다른 회원이 사용한 워프 정보예요. 운영자에게 문의해 주세요." }, 409);
    return json({ ok: true, legacy });
  } catch (e) {
    return fail(e);
  }
}

/** 워프 이메일 확인 중인 회원이 다른 워프 이메일로 바꾸거나 다시 보낸다(로그인 필요). */
async function legacyChange(b: Record<string, unknown>) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const email = normEmail(b.email);
  if (!email) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const pending = await sql`select 1 from legacy_claims where user_id = ${me} and not used and expires_at > now()`;
    if (!pending.length) return json({ error: "확인 중인 워프 정보가 없어요." }, 400);
    const hit = await findLegacyByKey(email);
    if (!hit) return json({ error: "워프 명단에서 찾을 수 없거나 이미 사용된 이메일이에요." }, 400);
    const token = randomBytes(32).toString("hex");
    await sql`delete from legacy_claims where user_id = ${me} and not used`;
    await sql`insert into legacy_claims (token_hash, user_id, warp_id, expires_at) values (${hashToken(token)}, ${me}, ${hit.warpId}, now() + interval '72 hours')`;
    await sendLegacyConfirmMail(email, `${siteUrl()}/?legacy=${token}`).catch(() => false);
    return json({ ok: true, sentTo: maskEmail(email) });
  } catch (e) {
    return fail(e);
  }
}

/** 메일 링크(?verify=)로 인증 완료 → 워프 이전 크레딧 지급 */
async function verifyEmail(b: Record<string, unknown>) {
  try {
    await ensureSchema();
    const token = typeof b.token === "string" ? b.token : "";
    // 가입 전 인증: 임시 가입 정보로 계정을 만든다.
    const created = await createFromPending(token);
    if (created === "taken") return json({ error: "이미 가입된 이메일입니다. 로그인해 주세요." }, 409);
    if (created) return json({ ok: true, created: true, welcome: created.welcome, legacy: created.legacy, legacyPending: created.legacyPending, user: await profile(created.id) });
    // 예전 방식(이미 가입된 회원의 인증 메일)
    const id = await finishVerify(token);
    if (!id) return json({ error: "인증 링크가 만료되었거나 이미 사용되었습니다. 로그인 후 위쪽 안내에서 인증 메일을 다시 받아 주세요." }, 400);
    const legacy = await grantLegacy(id).catch(() => 0);
    const me = await currentUserId();
    if (!me) await setUserSession(id);
    return json({ ok: true, legacy, user: await profile(me ?? id) });
  } catch (e) {
    return fail(e);
  }
}

/** 로그인한 회원: 인증 메일 다시 보내기, 약관 동의(기존 회원), 마케팅 수신 변경 */
async function accountAction(b: Record<string, unknown>) {
  const me = await currentUserId();
  if (!me) return needLogin();
  try {
    await ensureSchema();
    const sql = db();
    if (b.action === "interests") {
      // 가입 뒤 희망 선택(복수): 출퇴근 카풀(carpool), 택시 동승(taxi), 기타(other)
      const list = Array.isArray(b.interests) ? b.interests.filter((x): x is string => typeof x === "string") : [];
      const picked = [...new Set(list.filter((x) => ["carpool", "taxi", "other"].includes(x)))];
      if (!picked.length) return json({ error: "하나 이상 골라 주세요." }, 400);
      await sql`update users set interests = ${picked}::text[] where id = ${me}`;
      return json({ user: await profile(me) });
    }
    if (b.action === "resendVerify") {
      const u = await sql`select email, email_verified from users where id = ${me}`;
      if (u[0]?.email_verified) return json({ ok: true, already: true });
      const r = await startVerify(me, String(u[0].email));
      if (r === "limited") return json({ error: "인증 메일은 1시간에 3번까지 보낼 수 있어요." }, 429);
      return json({ ok: true });
    }
    if (b.terms !== true || b.privacy !== true) return json({ error: "이용약관과 개인정보 수집·이용에 동의해 주세요." }, 400);
    const mkt = b.marketing === true;
    const r = await sql`update users set terms_at = coalesce(terms_at, now()), marketing = ${mkt}, marketing_at = now() where id = ${me} returning email`;
    if (r.length) await logConsent(me, String(r[0].email), mkt, "verify");
    return json({ user: await profile(me) });
  } catch (e) {
    return fail(e);
  }
}

/** 이메일 앞부분으로 기본 닉네임을 만든다. 2자 미만이면 임의 번호를 붙인다. */
function defaultNickname(email: string) {
  const base = email.split("@")[0].replace(/[^0-9A-Za-z가-힣_]/g, "").slice(0, 12);
  return base.length >= 2 ? base : `회원${randomBytes(2).readUInt16BE(0) % 10000}`;
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const FORGOT_OK = "가입된 이메일이라면 비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.";

/** 비밀번호 찾기: 가입 여부와 관계없이 같은 답을 주고, 가입된 메일이면 재설정 링크를 보낸다. */
async function forgot(req: Request, email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  const ip = clientIp(req);
  try {
    await ensureSchema();
    const sql = db();
    const n = await sql`select count(*)::int as n from password_resets where ip = ${ip} and created_at > now() - interval '1 hour'`;
    if ((n[0].n as number) >= 10) return json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
    const u = await sql`select id from users where email = ${email} and not test and not blocked and withdrawn_at is null`;
    if (u.length) {
      const recent = await sql`select count(*)::int as n from password_resets where user_id = ${u[0].id} and created_at > now() - interval '1 hour'`;
      if ((recent[0].n as number) < 3) {
        const token = randomBytes(32).toString("hex");
        await sql`insert into password_resets (token_hash, user_id, ip, expires_at) values (${hashToken(token)}, ${u[0].id}, ${ip}, now() + interval '30 minutes')`;
        await sendResetMail(email, `${siteUrl()}/?reset=${token}`);
      }
    } else {
      // 가입 여부가 응답 시간으로 드러나지 않게 조금 기다린다.
      await new Promise((r) => setTimeout(r, 300));
    }
    await sql`delete from password_resets where created_at < now() - interval '1 day'`;
    return json({ ok: true, message: FORGOT_OK });
  } catch (e) {
    return fail(e);
  }
}

/** 메일 링크의 토큰으로 새 비밀번호를 정한다. 성공하면 다른 기기의 로그인은 끊기고 이 기기는 로그인된다. */
async function resetPassword(b: Record<string, unknown>) {
  const token = typeof b.token === "string" && /^[a-f0-9]{64}$/.test(b.token) ? b.token : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!token) return json({ error: "링크가 올바르지 않습니다. 비밀번호 찾기를 다시 해 주세요." }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "비밀번호는 8자 이상이어야 합니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const used = await sql`update password_resets set used = true
      where token_hash = ${hashToken(token)} and not used and expires_at > now() returning user_id`;
    if (!used.length) return json({ error: "링크가 만료되었거나 이미 사용되었습니다. 비밀번호 찾기를 다시 해 주세요." }, 400);
    const id = String(used[0].user_id);
    const hash = await bcrypt.hash(password, 10);
    const rows = await sql`update users set pw = ${hash}, pw_reset_required = false, pw_at = date_trunc('second', now()) - interval '2 seconds' where id = ${id} and not blocked and withdrawn_at is null returning id`;
    if (!rows.length) return json({ error: "이용이 정지된 계정입니다." }, 403);
    await sql`update password_resets set used = true where user_id = ${id}`;
    await setUserSession(id);
    return json({ user: await profile(id) });
  } catch (e) {
    return fail(e);
  }
}

/** 로그인한 회원이 설정에서 현재 비밀번호를 확인한 뒤 새 비밀번호로 바꾼다. 다른 기기의 로그인은 끊기고 이 기기는 유지된다. */
async function changePassword(b: Record<string, unknown>) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const current = typeof b.current === "string" ? b.current : "";
  const next = typeof b.password === "string" ? b.password : "";
  if (!current) return json({ error: "현재 비밀번호를 입력해 주세요." }, 400);
  if (next.length < 8 || next.length > 72) return json({ error: "새 비밀번호는 8자 이상이어야 합니다." }, 400);
  if (next === current) return json({ error: "현재 비밀번호와 다른 비밀번호를 정해 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    if (await overLimit("pw-change", me, 5, 15)) return json({ error: "비밀번호 확인을 여러 번 틀렸어요. 15분 뒤에 다시 해 주세요." }, 429);
    const rows = await sql`select pw from users where id = ${me} and not blocked and withdrawn_at is null`;
    if (!rows.length) return needLogin();
    if (!(await bcrypt.compare(current, String(rows[0].pw)))) {
      await recordAttempt("pw-change", me);
      return json({ error: "현재 비밀번호가 맞지 않아요." }, 400);
    }
    const hash = await bcrypt.hash(next, 10);
    await sql`update users set pw = ${hash}, pw_reset_required = false, pw_at = date_trunc('second', now()) - interval '2 seconds' where id = ${me}`;
    await setUserSession(me);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 프로필 수정 */
export async function PATCH(req: Request) {
  const id = await currentUserId();
  if (!id) return needLogin();
  const b = await body(req);
  // 현재 역할 스위치: 역할만 보내면 그 값만 바꾼다(다른 프로필 정보는 건드리지 않는다).
  if ((b.rolePref === "driver" || b.rolePref === "rider") && Object.keys(b).every((k) => k === "rolePref")) {
    try {
      await ensureSchema();
      await db()`update users set role_pref = ${String(b.rolePref)} where id = ${id}`;
      return json({ user: await profile(id) });
    } catch (e) {
      return fail(e);
    }
  }
  if (typeof b.marketing === "boolean" && b.name === undefined) {
    try {
      await ensureSchema();
      const r = await db()`update users set marketing = ${b.marketing}, marketing_at = now() where id = ${id} returning email`;
      if (r.length) await logConsent(id, String(r[0].email), b.marketing === true, "profile");
      return json({ user: await profile(id) });
    } catch (e) {
      return fail(e);
    }
  }
  if (typeof b.notify === "boolean" && b.name === undefined) {
    try {
      await ensureSchema();
      await db()`update users set notify = ${b.notify} where id = ${id}`;
      return json({ user: await profile(id) });
    } catch (e) {
      return fail(e);
    }
  }
  if (typeof b.carNo === "string" && b.name === undefined) {
    // 차량번호: 공백을 빼고 '12가3456', '123가4567', '서울12가3456' 꼴만 받는다. 빈 값이면 삭제.
    const carNo = b.carNo.replace(/\s/g, "").slice(0, 12);
    if (carNo && !/^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/.test(carNo)) return json({ error: "차량번호 형식을 확인해 주세요. 예: 12가3456" }, 400);
    try {
      await ensureSchema();
      await db()`update users set car_no = ${carNo} where id = ${id}`;
      const credit = await grantCarIfReady(id);
      return json({ user: await profile(id), credit });
    } catch (e) {
      return fail(e);
    }
  }
  const contactType = CONTACT_TYPES.some(([k]) => k === b.contactType) ? String(b.contactType) : "";
  try {
    await ensureSchema();
    const gender = ["female", "male"].includes(String(b.gender)) ? String(b.gender) : "";
    const rolePref = ["driver", "rider"].includes(String(b.rolePref)) ? String(b.rolePref) : "";
    // 성별과 역할은 필수다.
    if (!gender) return json({ error: "성별을 선택해 주세요." }, 400);
    if (!rolePref) return json({ error: "역할(운전자 또는 탑승자)을 선택해 주세요." }, 400);
    // 연락 방법과 아이디는 필수다(신청이 수락된 상대에게만 보인다).
    if (!contactType || !text(b.contact, 60)) return json({ error: "연락 방법과 아이디를 입력해 주세요." }, 400);
    await db()`update users set bio = ${text(b.bio, 200)}, contact = ${text(b.contact, 60)}, contact_type = ${contactType}, gender = ${gender}, role_pref = ${rolePref} where id = ${id}`;
    return json({ user: await profile(id) });
  } catch (e) {
    return fail(e);
  }
}

/** 프로필 사진 등록·삭제. 화면에서 240px JPEG로 줄여서 보낸다. 빈 값이면 삭제. */
export async function PUT(req: Request) {
  const id = await currentUserId();
  if (!id) return needLogin();
  const b = await body(req);
  const car = b.kind === "car";
  const raw = typeof b.photo === "string" ? b.photo : "";
  let data = "";
  if (raw) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
    // 프로필 사진은 240px 정사각, 차량 사진은 긴 변 800px까지
    if (!m || m[1].length > (car ? 300_000 : 110_000)) return json({ error: "사진 파일을 확인해 주세요." }, 400);
    const head = Buffer.from(m[1].slice(0, 8), "base64");
    // JPEG 파일은 FF D8 FF 로 시작한다.
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return json({ error: "사진 파일을 확인해 주세요." }, 400);
    data = m[1];
  }
  try {
    await ensureSchema();
    const v = data ? Math.floor(Date.now() / 1000) : 0;
    let credit = 0;
    if (car) {
      await db()`update users set car_photo = ${data}, car_v = ${v} where id = ${id}`;
      credit = await grantCarIfReady(id);
    } else {
      // 삭제 시에만 기존 사진 여부를 본다(사진이 있었을 때만 차감).
      const before = data ? [] : await db()`select photo_v from users where id = ${id}`;
      const hadPhoto = Number(before[0]?.photo_v ?? 0) > 0;
      await db()`update users set photo = ${data}, photo_v = ${v} where id = ${id}`;
      if (data) credit = await grant(id, "photo");
      else if (hadPhoto) credit = await charge(id, (await getRules()).photo, "photo_del", "프로필 사진 삭제");
    }
    return json({ user: await profile(id), credit });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  await clearCookie("user");
  return json({ ok: true });
}
