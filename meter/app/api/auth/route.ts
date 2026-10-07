import bcrypt from "bcryptjs";
import { authEnabled, clearCookie, currentUser, db, ensureSchema, json, setUserSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = authEnabled() ? await currentUser() : null;
  return json({ enabled: authEnabled(), user: user ? { email: user.email } : null });
}

export async function POST(req: Request) {
  if (!authEnabled()) return json({ error: "로그인 기능이 아직 준비 중입니다." }, 503);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)
    return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  if (password.length < 8 || password.length > 72)
    return json({ error: "비밀번호는 8자 이상이어야 합니다." }, 400);

  try {
    await ensureSchema();
    const sql = db();
    if (action === "signup") {
      const exists = await sql`select 1 from users where email = ${email}`;
      if (exists.length) return json({ error: "이미 가입된 이메일입니다." }, 409);
      const hash = await bcrypt.hash(password, 10);
      const rows = await sql`insert into users (email, pw) values (${email}, ${hash}) returning id`;
      await setUserSession(String(rows[0].id), email);
      return json({ user: { email } });
    }
    if (action === "login") {
      const rows = await sql`select id, pw from users where email = ${email}`;
      const ok = rows.length > 0 && (await bcrypt.compare(password, String(rows[0].pw)));
      if (!ok) return json({ error: "이메일 또는 비밀번호가 맞지 않습니다." }, 401);
      await setUserSession(String(rows[0].id), email);
      return json({ user: { email } });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch {
    return json({ error: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요." }, 500);
  }
}

export async function DELETE() {
  await clearCookie("user");
  return json({ ok: true });
}
