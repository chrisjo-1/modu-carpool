import { DEMO_EMAIL_LIKE, DEMO_MAX, createDemo } from "@/lib/demo";
import { body, db, ensureSchema, fail, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";

const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 임시 게시물 목록 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  try {
    await ensureSchema();
    const rows = await db()`
      select p.id, p.origin, p.dest, p.depart_at, p.role, p.kind, p.cost, p.price, p.regular, p.days, p.time_go, p.status,
             p.taxi_share, p.demo_shown, p.created_at, u.name
      from posts p join users u on u.id = p.user_id
      where p.demo order by p.created_at desc limit 200`;
    return json({
      posts: rows.map((r) => ({ ...r, depart_at: new Date(r.depart_at as string).getTime(), created_at: new Date(r.created_at as string).getTime() })),
      max: DEMO_MAX,
    });
  } catch (e) {
    return fail(e);
  }
}

/** 만들기(action: create, count) */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  if (b.action !== "create") return json({ error: "잘못된 요청입니다." }, 400);
  const count = Math.round(Number(b.count));
  if (!(count >= 1 && count <= 30)) return json({ error: "한 번에 1~30개까지 만들 수 있어요." }, 400);
  try {
    const r = await createDemo(count);
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, created: r.created });
  } catch (e) {
    return fail(e);
  }
}

/** 노출·숨김: { id, shown } 한 개 또는 { all: true, shown } 전체 */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const shown = b.shown === true;
  try {
    await ensureSchema();
    const sql = db();
    if (b.all === true) await sql`update posts set demo_shown = ${shown} where demo`;
    else if (isUuid(b.id)) await sql`update posts set demo_shown = ${shown} where demo and id = ${b.id}`;
    else return json({ error: "잘못된 요청입니다." }, 400);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 삭제: ?id= 한 개, ?all=1 전체(임시 회원 중 글이 없게 된 계정도 함께 지운다) */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return denied();
  const url = new URL(req.url);
  try {
    await ensureSchema();
    const sql = db();
    if (url.searchParams.get("all") === "1") {
      await sql`delete from posts where demo`;
      await sql`delete from users u where u.test and u.email like ${DEMO_EMAIL_LIKE} and not exists (select 1 from posts p where p.user_id = u.id)`;
      return json({ ok: true });
    }
    const id = text(url.searchParams.get("id"), 60);
    if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
    await sql`delete from posts where demo and id = ${id}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
