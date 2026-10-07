import { body, checkAdminPassword, clearCookie, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, setAdminSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return json({ admin: false });
  if (!hasDb()) return json({ admin: true, db: false, stats: null, posts: [] });
  try {
    await ensureSchema();
    const sql = db();
    const s = await sql`select
      (select count(*)::int from users) as users,
      (select count(*)::int from posts) as posts,
      (select count(*)::int from requests) as requests,
      (select count(*)::int from requests where status = 'accepted') as accepted`;
    const posts = await sql`
      select p.id, p.origin, p.dest, p.depart_at, p.role, p.kind, p.cost, p.status, u.email, u.name
      from posts p join users u on u.id = p.user_id order by p.created_at desc limit 100`;
    return json({
      admin: true,
      db: true,
      stats: s[0],
      posts: posts.map((p) => ({ ...p, depart_at: new Date(p.depart_at as string).getTime() })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const b = await body(req);
  await new Promise((r) => setTimeout(r, 400)); // 무차별 대입 완화
  if (!checkAdminPassword(typeof b.password === "string" ? b.password : "")) return json({ error: "비밀번호가 맞지 않습니다." }, 401);
  await setAdminSession();
  return json({ ok: true });
}

/** ?post=ID 가 있으면 글 삭제, 없으면 관리자 로그아웃 */
export async function DELETE(req: Request) {
  const post = new URL(req.url).searchParams.get("post");
  if (!post) {
    await clearCookie("admin");
    return json({ ok: true });
  }
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!isUuid(post) || !hasDb()) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from posts where id = ${post}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
