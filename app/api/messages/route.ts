import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 수락된 신청의 당사자(글 작성자·신청자)인지 확인 */
async function canChat(requestId: string, me: string) {
  const rows = await db()`
    select 1 from requests r join posts p on p.id = r.post_id
    where r.id = ${requestId} and r.status = 'accepted' and (r.user_id = ${me} or p.user_id = ${me})`;
  return rows.length > 0;
}

export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const id = new URL(req.url).searchParams.get("request");
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    if (!(await canChat(id, me))) return json({ error: "수락된 뒤에 대화할 수 있습니다." }, 403);
    const rows = await db()`select id, user_id, body, created_at from messages where request_id = ${id} order by id desc limit 200`;
    return json({
      messages: rows.reverse().map((m) => ({
        id: Number(m.id),
        mine: m.user_id === me,
        body: m.body,
        at: new Date(m.created_at as string).getTime(),
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const msg = text(b.body, 500);
  if (!isUuid(b.requestId) || !msg) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    if (!(await canChat(b.requestId, me))) return json({ error: "수락된 뒤에 대화할 수 있습니다." }, 403);
    await db()`insert into messages (request_id, user_id, body) values (${b.requestId}, ${me}, ${msg})`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
