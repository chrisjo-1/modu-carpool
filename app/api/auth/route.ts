import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { grant, grantLegacy } from "@/lib/credits";
import { finishVerify, startVerify } from "@/lib/verify";
import { matchNewUser } from "@/lib/legacy";
import { sendResetMail, siteUrl } from "@/lib/mail";
import { CONTACT_TYPES } from "@/lib/types";
import { authEnabled, body, clearCookie, clientIp, overLimit, recordAttempt, currentUserId, db, ensureSchema, fail, json, needLogin, carPhotoUrl, photoUrl, setUserSession, text } from "@/lib/server";

export const dynamic = "force-dynamic";

async function profile(id: string) {
  const rows = await db()`select email, name, bio, contact, contact_type, photo_v, test, notify, car_no, car_v, gender, role_pref, email_verified, terms_at, marketing from users where id = ${id}`;
  return rows.length ? { id, email: rows[0].email, name: rows[0].name, bio: rows[0].bio, contact: rows[0].contact, contactType: rows[0].contact_type, photo: photoUrl(id, rows[0].photo_v), test: rows[0].test === true, notify: rows[0].notify !== false, carNo: rows[0].car_no ?? "", carPhoto: carPhotoUrl(id, rows[0].car_v), gender: rows[0].gender ?? "", rolePref: rows[0].role_pref ?? "", verified: rows[0].email_verified !== false, consented: !!rows[0].terms_at, marketing: rows[0].marketing === true } : null;
}

export async function GET() {
  if (!authEnabled()) return json({ enabled: false, user: null });
  try {
    const id = await currentUserId();
    if (!id) return json({ enabled: true, user: null });
    await ensureSchema();
    return json({ enabled: true, user: await profile(id) });
  } catch {
    return json({ enabled: true, user: null });
  }
}

export async function POST(req: Request) {
  if (!authEnabled()) return json({ error: "로그인 기능이 아직 준비 중입니다." }, 503);
  const b = await body(req);
  if (b.action === "reset") return resetPassword(b);
  if (b.action === "verify") return verifyEmail(b);
  if (b.action === "resendVerify" || b.action === "consent") return accountAction(b);
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
      const exists = await sql`select 1 from users where email = ${email}`;
      if (exists.length) return json({ error: "이미 가입된 이메일입니다." }, 409);
      await recordAttempt("signup-ip", ip);
      const hash = await bcrypt.hash(password, 10);
      const mkt = b.marketing === true;
      const rows = await sql`insert into users (email, pw, name, notify, email_verified, terms_at, marketing, marketing_at)
        values (${email}, ${hash}, ${name}, ${b.notify !== false}, false, now(), ${mkt}, ${mkt ? new Date().toISOString() : null}) returning id`;
      // 구 워프 회원이면 대조 상태를 바로 '가입됨'으로 바꾼다(실패해도 가입은 진행).
      await matchNewUser(String(rows[0].id), email).catch((e) => console.error("[legacy]", e));
      const welcome = await grant(String(rows[0].id), "signup").catch(() => 0);
      // 워프 이전 크레딧은 이메일 인증을 마친 뒤 지급한다(남의 이메일로 가입해 받는 것을 막는다).
      const verify = await startVerify(String(rows[0].id), email).catch(() => "nomail");
      await setUserSession(String(rows[0].id));
      return json({ user: await profile(String(rows[0].id)), credit: welcome, verify });
    }
    if (b.action === "login") {
      // 비밀번호 무차별 대입 방지: 같은 이메일 15분에 10번, 같은 곳 15분에 30번 틀리면 잠깐 막는다.
      if ((await overLimit("login-email", email, 10, 15)) || (await overLimit("login-ip", ip, 30, 15)))
        return json({ error: "로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도하거나 비밀번호 찾기를 이용해 주세요." }, 429);
      const rows = await sql`select id, pw, blocked from users where email = ${email}`;
      const ok = rows.length > 0 && (await bcrypt.compare(password, String(rows[0].pw)));
      if (!ok) {
        await recordAttempt("login-email", email);
        await recordAttempt("login-ip", ip);
        return json({ error: "이메일 또는 비밀번호가 맞지 않습니다." }, 401);
      }
      if (rows[0].blocked) return json({ error: "이용이 정지된 계정입니다. 문의가 필요하면 운영자에게 연락해 주세요." }, 403);
      await setUserSession(String(rows[0].id));
      return json({ user: await profile(String(rows[0].id)) });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}

/** 메일 링크(?verify=)로 인증 완료 → 워프 이전 크레딧 지급 */
async function verifyEmail(b: Record<string, unknown>) {
  try {
    await ensureSchema();
    const id = await finishVerify(typeof b.token === "string" ? b.token : "");
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
    if (b.action === "resendVerify") {
      const u = await sql`select email, email_verified from users where id = ${me}`;
      if (u[0]?.email_verified) return json({ ok: true, already: true });
      const r = await startVerify(me, String(u[0].email));
      if (r === "limited") return json({ error: "인증 메일은 1시간에 3번까지 보낼 수 있어요." }, 429);
      return json({ ok: true });
    }
    if (b.terms !== true || b.privacy !== true) return json({ error: "이용약관과 개인정보 수집·이용에 동의해 주세요." }, 400);
    const mkt = b.marketing === true;
    await sql`update users set terms_at = coalesce(terms_at, now()), marketing = ${mkt}, marketing_at = now() where id = ${me}`;
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
    const u = await sql`select id from users where email = ${email} and not test and not blocked`;
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
    const rows = await sql`update users set pw = ${hash}, pw_at = date_trunc('second', now()) - interval '2 seconds' where id = ${id} and not blocked returning id`;
    if (!rows.length) return json({ error: "이용이 정지된 계정입니다." }, 403);
    await sql`update password_resets set used = true where user_id = ${id}`;
    await setUserSession(id);
    return json({ user: await profile(id) });
  } catch (e) {
    return fail(e);
  }
}

/** 프로필 수정 */
export async function PATCH(req: Request) {
  const id = await currentUserId();
  if (!id) return needLogin();
  const b = await body(req);
  if (typeof b.marketing === "boolean" && b.name === undefined) {
    try {
      await ensureSchema();
      await db()`update users set marketing = ${b.marketing}, marketing_at = now() where id = ${id}`;
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
      return json({ user: await profile(id) });
    } catch (e) {
      return fail(e);
    }
  }
  const name = text(b.name, 20);
  if (name.length < 2) return json({ error: "닉네임을 2자 이상 입력해 주세요." }, 400);
  const contactType = CONTACT_TYPES.some(([k]) => k === b.contactType) ? String(b.contactType) : "";
  try {
    await ensureSchema();
    const gender = ["female", "male"].includes(String(b.gender)) ? String(b.gender) : "";
    const rolePref = ["driver", "rider", "both"].includes(String(b.rolePref)) ? String(b.rolePref) : "";
    await db()`update users set name = ${name}, bio = ${text(b.bio, 200)}, contact = ${text(b.contact, 60)}, contact_type = ${contactType}, gender = ${gender}, role_pref = ${rolePref} where id = ${id}`;
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
    if (car) await db()`update users set car_photo = ${data}, car_v = ${v} where id = ${id}`;
    else await db()`update users set photo = ${data}, photo_v = ${v} where id = ${id}`;
    return json({ user: await profile(id) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  await clearCookie("user");
  return json({ ok: true });
}
