import bcrypt from "bcryptjs";
import { CONTACT_TYPES } from "@/lib/types";
import { authEnabled, body, clearCookie, currentUserId, db, ensureSchema, fail, json, needLogin, photoUrl, setUserSession, text } from "@/lib/server";

export const dynamic = "force-dynamic";

async function profile(id: string) {
  const rows = await db()`select email, name, bio, contact, contact_type, photo_v, test from users where id = ${id}`;
  return rows.length ? { id, email: rows[0].email, name: rows[0].name, bio: rows[0].bio, contact: rows[0].contact, contactType: rows[0].contact_type, photo: photoUrl(id, rows[0].photo_v), test: rows[0].test === true } : null;
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
  const email = text(b.email, 120).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
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
      const rows = await sql`insert into users (email, pw, name) values (${email}, ${hash}, ${name}) returning id`;
      await setUserSession(String(rows[0].id));
      return json({ user: await profile(String(rows[0].id)) });
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

/** 프로필 수정 */
export async function PATCH(req: Request) {
  const id = await currentUserId();
  if (!id) return needLogin();
  const b = await body(req);
  const name = text(b.name, 20);
  if (name.length < 2) return json({ error: "닉네임을 2자 이상 입력해 주세요." }, 400);
  const contactType = CONTACT_TYPES.some(([k]) => k === b.contactType) ? String(b.contactType) : "";
  try {
    await ensureSchema();
    await db()`update users set name = ${name}, bio = ${text(b.bio, 200)}, contact = ${text(b.contact, 60)}, contact_type = ${contactType} where id = ${id}`;
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
  const raw = typeof b.photo === "string" ? b.photo : "";
  let data = "";
  if (raw) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
    if (!m || m[1].length > 110_000) return json({ error: "사진 파일을 확인해 주세요." }, 400);
    const head = Buffer.from(m[1].slice(0, 8), "base64");
    // JPEG 파일은 FF D8 FF 로 시작한다.
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return json({ error: "사진 파일을 확인해 주세요." }, 400);
    data = m[1];
  }
  try {
    await ensureSchema();
    await db()`update users set photo = ${data}, photo_v = ${data ? Math.floor(Date.now() / 1000) : 0} where id = ${id}`;
    return json({ user: await profile(id) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  await clearCookie("user");
  return json({ ok: true });
}
