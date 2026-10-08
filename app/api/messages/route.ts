import { notify } from "@/lib/mail";
import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 수락된 신청의 당사자(글 작성자·신청자)인지 확인 */
async function canChat(requestId: string, me: string) {
  const rows = await db()`
    select 1 from requests r join posts p on p.id = r.post_id
    where r.id = ${requestId} and r.status = 'accepted' and (r.user_id = ${me} or p.user_id = ${me})
      and not exists (select 1 from blocks k where (k.blocker = r.user_id and k.blocked = p.user_id) or (k.blocker = p.user_id and k.blocked = r.user_id))`;
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
    const sql = db();
    const rows = await sql`select id, user_id, body, (image <> '') as has_image, created_at from messages where request_id = ${id} order by id desc limit 200`;
    // 대화를 열어 본 것으로 기록해 안 읽은 수를 0으로 만든다.
    if (rows.length)
      await sql`insert into chat_reads (request_id, user_id, last_id) values (${id}, ${me}, ${rows[0].id})
                on conflict (request_id, user_id) do update set last_id = greatest(chat_reads.last_id, excluded.last_id)`;
    return json({
      messages: rows.reverse().map((m) => ({
        id: Number(m.id),
        mine: m.user_id === me,
        body: m.body,
        image: m.has_image ? `/api/chatimg?m=${m.id}` : "",
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
  // 사진은 기기에서 줄인 JPEG(data URL)만 받는다. 약 600KB 이하.
  let image = "";
  if (typeof b.image === "string" && b.image) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(b.image);
    if (!m || m[1].length > 820_000) return json({ error: "사진이 너무 크거나 형식이 맞지 않습니다." }, 400);
    const head = Buffer.from(m[1].slice(0, 8), "base64");
    if (head[0] !== 0xff || head[1] !== 0xd8) return json({ error: "사진 형식이 맞지 않습니다." }, 400);
    image = m[1];
  }
  if (!isUuid(b.requestId) || (!msg && !image)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    if (!(await canChat(b.requestId, me))) return json({ error: "수락된 뒤에 대화할 수 있습니다." }, 403);
    const sql = db();
    const sent = await sql`insert into messages (request_id, user_id, body, image) values (${b.requestId}, ${me}, ${msg}, ${image}) returning id`;
    await sql`insert into chat_reads (request_id, user_id, last_id) values (${b.requestId}, ${me}, ${sent[0].id})
              on conflict (request_id, user_id) do update set last_id = greatest(chat_reads.last_id, excluded.last_id)`;
    // 이 대화에서 내가 보낸 첫 메시지일 때만 상대에게 메일로 알린다.
    const n = await sql`select count(*)::int as n from messages where request_id = ${b.requestId} and user_id = ${me}`;
    if (n[0].n === 1) {
      const r = await sql`select r.user_id as req_id, p.user_id as owner_id, p.origin, p.dest, (select name from users where id = ${me}) as name
                          from requests r join posts p on p.id = r.post_id where r.id = ${b.requestId}`;
      if (r.length) await notify(String(r[0].owner_id === me ? r[0].req_id : r[0].owner_id), "hello", String(r[0].name ?? ""), `${r[0].origin} → ${r[0].dest}`, msg || "(사진)");
    }
    return json({ ok: true, id: Number(sent[0].id) });
  } catch (e) {
    return fail(e);
  }
}
