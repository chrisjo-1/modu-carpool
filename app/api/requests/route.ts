import { notify } from "@/lib/mail";
import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, photoUrl, text } from "@/lib/server";
import { nextOccurrence } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 내가 보낸 신청 + 내 글에 들어온 신청. 연락처는 수락된 뒤에만 내려준다. */
export async function GET() {
  const me = await currentUserId();
  if (!me) return needLogin();
  try {
    await ensureSchema();
    const rows = await db()`
      select r.id, r.status, r.message, r.created_at, r.user_id as req_id,
             p.id as post_id, p.origin, p.dest, p.depart_at, p.cost, p.price, p.regular, p.days, p.time_go, p.time_back, p.user_id as owner_id,
             ou.photo_v as owner_pv, ru.photo_v as req_pv,
             ou.name as owner_name, ou.contact as owner_contact, ou.contact_type as owner_ctype,
             ru.name as req_name, ru.contact as req_contact, ru.contact_type as req_ctype, ru.bio as req_bio,
             coalesce(rv.stars, 0) as my_stars, (p.regular or p.depart_at < now()) as passed
      from requests r
      left join reviews rv on rv.request_id = r.id and rv.rater = ${me}
      join posts p on p.id = r.post_id
      join users ou on ou.id = p.user_id
      join users ru on ru.id = r.user_id
      where (r.user_id = ${me} or p.user_id = ${me})
        and not exists (select 1 from blocks k where (k.blocker = r.user_id and k.blocked = p.user_id) or (k.blocker = p.user_id and k.blocked = r.user_id))
      order by r.created_at desc limit 100`;
    return json({
      threads: rows.map((r) => {
        const iAmOwner = r.owner_id === me;
        const accepted = r.status === "accepted";
        return {
          id: r.id,
          postId: r.post_id,
          origin: r.origin,
          dest: r.dest,
          departAt: r.regular ? nextOccurrence(String(r.days), String(r.time_go)) : new Date(r.depart_at as string).getTime(),
          cost: r.cost,
          price: r.price,
          regular: r.regular,
          days: r.days,
          timeGo: r.time_go,
          timeBack: r.time_back,
          otherId: iAmOwner ? r.req_id : r.owner_id,
          otherPhoto: iAmOwner ? photoUrl(r.req_id, r.req_pv) : photoUrl(r.owner_id, r.owner_pv),
          status: r.status,
          message: r.message,
          iAmOwner,
          other: (iAmOwner ? r.req_name : r.owner_name) || "회원",
          otherBio: iAmOwner ? r.req_bio : "",
          contact: accepted ? (iAmOwner ? r.req_contact : r.owner_contact) : null,
          contactType: accepted ? (iAmOwner ? r.req_ctype : r.owner_ctype) : "",
          canRate: accepted && !!r.passed,
          myStars: r.my_stars,
        };
      }),
    });
  } catch (e) {
    return fail(e);
  }
}

/** 카풀 신청 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.postId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const post = await sql`select user_id, status, origin, dest from posts where id = ${b.postId}`;
    if (post.length && post[0].status === "progress") return json({ error: "이미 카풀이 진행 중인 글이라 신청할 수 없습니다." }, 409);
    if (!post.length || post[0].status !== "open") return json({ error: "마감되었거나 없는 글입니다." }, 404);
    if (post[0].user_id === me) return json({ error: "내가 올린 글에는 신청할 수 없습니다." }, 400);
    const cut = await sql`select 1 from blocks where (blocker = ${me} and blocked = ${post[0].user_id}) or (blocker = ${post[0].user_id} and blocked = ${me})`;
    if (cut.length) return json({ error: "신청할 수 없는 글입니다." }, 403);
    const made = await sql`insert into requests (post_id, user_id, message) values (${b.postId}, ${me}, ${text(b.message, 300)})
              on conflict (post_id, user_id) do nothing returning id`;
    if (made.length) {
      const who = await sql`select name from users where id = ${me}`;
      await notify(String(post[0].user_id), "request", String(who[0]?.name ?? ""), `${post[0].origin} → ${post[0].dest}`, text(b.message, 300));
    }
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 글 작성자가 신청을 수락·거절 */
export async function PATCH(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.id) || (b.status !== "accepted" && b.status !== "declined")) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const before = await sql`select status from requests where id = ${b.id}`;
    const rows = await sql`
      update requests r set status = ${b.status} from posts p
      where r.id = ${b.id} and p.id = r.post_id and p.user_id = ${me} returning r.id, r.user_id, p.origin, p.dest`;
    if (!rows.length) return json({ error: "권한이 없습니다." }, 403);
    if (b.status === "accepted" && before[0]?.status !== "accepted") {
      const who = await sql`select name from users where id = ${me}`;
      await notify(String(rows[0].user_id), "accepted", String(who[0]?.name ?? ""), `${rows[0].origin} → ${rows[0].dest}`);
    }
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 신청자가 신청 취소 */
export async function DELETE(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from requests where id = ${id} and user_id = ${me}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
