import { targetUsers } from "@/lib/notices";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 나에게 해당하는 공지. 기본은 아직 확인하지 않은 공지(팝업용), ?all=1 이면 최근 공지 전체 */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return json({ notices: [] });
  const all = new URL(req.url).searchParams.get("all") === "1";
  try {
    await ensureSchema();
    const sql = db();
    const rows = all
      ? await sql`select n.id, n.title, n.body, n.roles, n.genders, n.created_at, (r.user_id is not null) as read
                  from notices n left join notice_reads r on r.notice_id = n.id and r.user_id = ${me}
                  order by n.id desc limit 30`
      : await sql`select n.id, n.title, n.body, n.roles, n.genders, n.created_at, false as read
                  from notices n where n.active and not exists (select 1 from notice_reads r where r.notice_id = n.id and r.user_id = ${me})
                  order by n.id desc limit 10`;
    const mine = [];
    for (const n of rows) if ((await targetUsers(n.roles as string[], n.genders as string[], me)).length) mine.push(n);
    return json({ notices: mine.map((n) => ({ id: Number(n.id), title: n.title, body: n.body, read: !!n.read, at: new Date(n.created_at as string).getTime() })) });
  } catch (e) {
    return fail(e);
  }
}

/** 확인 표시 {id} */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const id = Math.round(Number(b.id));
  if (!(id > 0)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`insert into notice_reads (notice_id, user_id) select ${id}, ${me} where exists (select 1 from notices where id = ${id}) on conflict do nothing`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
