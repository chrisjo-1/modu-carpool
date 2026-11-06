import { body, currentUserId, db, ensureSchema, fail, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 앱 안 알림함. ?count=1 이면 안 읽은 수만(가볍게), 아니면 최근 50개 + 안 읽은 수 */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  try {
    await ensureSchema();
    const sql = db();
    const c = await sql`select count(*)::int as n from user_alerts where user_id = ${me} and read_at is null`;
    const unread = Number(c[0]?.n) || 0;
    if (new URL(req.url).searchParams.get("count")) return json({ unread });
    const rows = await sql`select id, title, body, url, created_at, read_at from user_alerts where user_id = ${me} order by created_at desc limit 50`;
    return json({
      unread,
      items: rows.map((r) => ({ id: Number(r.id), title: String(r.title), body: String(r.body), url: String(r.url), at: new Date(r.created_at as string).getTime(), read: !!r.read_at })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** {action:"read", id} 하나 읽음 · {action:"readAll"} 모두 읽음 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();
    if (b.action === "readAll") {
      await sql`update user_alerts set read_at = now() where user_id = ${me} and read_at is null`;
      return json({ ok: true, unread: 0 });
    }
    const id = Number(b.id);
    if (b.action === "read" && Number.isInteger(id) && id > 0) {
      await sql`update user_alerts set read_at = coalesce(read_at, now()) where id = ${id} and user_id = ${me}`;
      const c = await sql`select count(*)::int as n from user_alerts where user_id = ${me} and read_at is null`;
      return json({ ok: true, unread: Number(c[0]?.n) || 0 });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}
