import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { grant, grantLegacy } from "@/lib/credits";
import { matchNewUser } from "@/lib/legacy";
import { sendResetMail, siteUrl } from "@/lib/mail";
import { CONTACT_TYPES } from "@/lib/types";
import { authEnabled, body, clearCookie, clientIp, currentUserId, db, ensureSchema, fail, json, needLogin, carPhotoUrl, photoUrl, setUserSession, text } from "@/lib/server";

export const dynamic = "force-dynamic";

async function profile(id: string) {
  const rows = await db()`select email, name, bio, contact, contact_type, photo_v, test, notify, car_no, car_v, gender, role_pref from users where id = ${id}`;
  return rows.length ? { id, email: rows[0].email, name: rows[0].name, bio: rows[0].bio, contact: rows[0].contact, contactType: rows[0].contact_type, photo: photoUrl(id, rows[0].photo_v), test: rows[0].test === true, notify: rows[0].notify !== false, carNo: rows[0].car_no ?? "", carPhoto: carPhotoUrl(id, rows[0].car_v), gender: rows[0].gender ?? "", rolePref: rows[0].role_pref ?? "" } : null;
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
  const email = text(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  if (b.action === "forgot") return forgot(req, email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "비밀번호는 8자 이상이어야 합니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    if (b.action === "signup") {
      const name = text(b.name, 20);
      if (name.length < 2) return json({ error: "닉네임을 2자 이상 입력해 주세요." }, 400);
      const exists = await sql`select 1 from users where email = ${email}`;
      if (exists.length) return json({ error: "이미 가입된 이메일입니다." }, 409);
      const hash = await bcrypt.hash(password, 10);
      const rows = await sql`insert into users (email, pw, name, notify) values (${email}, ${hash}, ${name}, ${b.notify !== false}) returning id`;
      // 구 워프 회원이면 대조 상태를 바로 '가입됨'으로 바꾼다(실패해도 가입은 진행).
      await matchNewUser(String(rows[0].id), email).catch((e) => console.error("[legacy]", e));
      const welcome = await grant(String(rows[0].id), "signup").catch(() => 0);
      const legacy = await grantLegacy(String(rows[0].id)).catch(() => 0);
      await setUserSession(String(rows[0].id));
      return json({ user: await profile(String(rows[0].id)), credit: welcome, legacy });
    }
    if (b.action === "login") {
      const rows = await sql`select id, pw, blocked from users where email = ${email}`;
      const ok = rows.length > 0 && (await bcrypt.compare(password, String(rows[0].pw)));
      if (!ok) return json({ error: "이메일 또는 비밀번호가 맞지 않습니다." }, 401);
      if (rows[0].blocked) return json({ error: "이용이 정지된 계정입니다. 문의가 필요하면 운영자에게 연락해 주세요." }, 403);
      await setUserSession(String(rows[0].id));
      return json({ user: await profile(String(rows[0].id)) });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
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
