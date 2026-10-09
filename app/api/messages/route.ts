import { getRules, spend } from "@/lib/credits";
import { notify, nudgeMail } from "@/lib/mail";
import { pushText, sendPush } from "@/lib/push";
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
      await sql`insert into chat_reads (request_id, user_id, last_id, read_at) values (${id}, ${me}, ${rows[0].id}, now())
                on conflict (request_id, user_id) do update set last_id = greatest(chat_reads.last_id, excluded.last_id), read_at = now()`;
    // 상대가 아직 읽지 않은 내 메시지 수와 마지막 메일 알림 시각(메일로 알리기 버튼용)
    const st = await sql`
      select (select count(*)::int from messages m where m.request_id = ${id} and m.user_id = ${me}
                and m.id > coalesce((select c.last_id from chat_reads c where c.request_id = ${id} and c.user_id <> ${me}), 0)) as other_unread,
             (select max(at) from mail_nudges n where n.request_id = ${id} and n.sender = ${me}) as nudged_at`;
    return json({
      nudgeCost: (await getRules()).nudge,
      otherUnread: st[0].other_unread,
      nudgedAt: st[0].nudged_at ? new Date(st[0].nudged_at as string).getTime() : null,
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
    const r = await sql`select r.user_id as req_id, p.user_id as owner_id, p.origin, p.dest, (select name from users where id = ${me}) as name,
                          (select count(*)::int from messages where request_id = ${b.requestId} and user_id = ${me}) as mine
                        from requests r join posts p on p.id = r.post_id where r.id = ${b.requestId}`;
    if (r.length) {
      const other = String(r[0].owner_id === me ? r[0].req_id : r[0].owner_id);
      const route = `${r[0].origin} → ${r[0].dest}`;
      // 상대가 지금 이 대화방을 보고 있으면(10초 안에 읽음) 푸시는 생략한다.
      const seen = await sql`select 1 from chat_reads where request_id = ${b.requestId} and user_id = ${other} and read_at > now() - interval '10 seconds'`;
      await Promise.all([
        // 이 대화에서 내가 보낸 첫 메시지일 때만 메일로도 알린다.
        r[0].mine === 1 ? notify(other, "hello", String(r[0].name ?? ""), route, msg || "(사진)") : null,
        seen.length ? null : sendPush(other, { title: `${r[0].name || "회원"} · ${route}`.slice(0, 60), body: pushText.cut(msg || "사진을 보냈어요", 120), url: `/?room=${b.requestId}`, tag: `chat-${b.requestId}` }),
      ]);
    }
    return json({ ok: true, id: Number(sent[0].id) });
  } catch (e) {
    return fail(e);
  }
}

/** 메일로 알리기: 상대가 내 메시지를 읽지 않았을 때, 대화마다 6시간에 한 번 */
export async function PUT(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.requestId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    if (!(await canChat(b.requestId, me))) return json({ error: "수락된 뒤에 대화할 수 있습니다." }, 403);
    const sql = db();
    const r = await sql`select r.user_id as req_id, p.user_id as owner_id, p.origin, p.dest, (select name from users where id = ${me}) as name
                        from requests r join posts p on p.id = r.post_id where r.id = ${b.requestId}`;
    const other = String(r[0].owner_id === me ? r[0].req_id : r[0].owner_id);
    const o = await sql`select notify, test from users where id = ${other}`;
    if (!o.length || o[0].test || o[0].notify === false) return json({ error: "상대가 메일 알림을 꺼 두어 보낼 수 없어요." }, 400);
    const unread = await sql`select id, body, (image <> '') as has_image from messages m where m.request_id = ${b.requestId} and m.user_id = ${me}
                               and m.id > coalesce((select c.last_id from chat_reads c where c.request_id = ${b.requestId} and c.user_id = ${other}), 0)
                             order by id desc`;
    if (!unread.length) return json({ error: "상대가 메시지를 모두 읽었어요." }, 400);
    const recent = await sql`select 1 from mail_nudges where request_id = ${b.requestId} and sender = ${me} and at > now() - interval '6 hours'`;
    if (recent.length) return json({ error: "메일 알림은 6시간에 한 번 보낼 수 있어요." }, 429);
    // 크레딧: 발송에 성공했을 때만 차감한다. 먼저 잔액이 충분한지 본다.
    const cost = (await getRules()).nudge;
    const bal = await sql`select credits from users where id = ${me}`;
    if (Number(bal[0]?.credits ?? 0) < cost) return json({ error: `크레딧이 부족해요. 메일로 알리기에는 ${cost.toLocaleString("ko-KR")} 크레딧이 필요해요.` }, 402);
    await sql`insert into mail_nudges (request_id, sender) values (${b.requestId}, ${me})`;
    const last = unread[0].has_image && !unread[0].body ? "(사진)" : String(unread[0].body);
    const ok = await nudgeMail(other, String(r[0].name ?? ""), `${r[0].origin} → ${r[0].dest}`, unread.length, last, `/?room=${b.requestId}`);
    if (!ok) {
      await sql`delete from mail_nudges where request_id = ${b.requestId} and sender = ${me} and at > now() - interval '1 minute'`;
      return json({ error: "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요." }, 502);
    }
    await spend(me, cost, "nudge", `${r[0].origin} → ${r[0].dest}`);
    return json({ ok: true, cost });
  } catch (e) {
    return fail(e);
  }
}
