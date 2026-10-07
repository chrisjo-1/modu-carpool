import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 별점 남기기(고칠 수 있다).
 * 수락된 카풀의 당사자끼리, 출발 시각이 지난 뒤에만(정기카풀은 수락 후 언제든) 남길 수 있다.
 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const stars = Math.round(Number(b.stars));
  if (!isUuid(b.requestId) || !(stars >= 1 && stars <= 5)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`
      select r.user_id as req_id, p.user_id as owner_id, (p.regular or p.depart_at < now()) as passed
      from requests r join posts p on p.id = r.post_id
      where r.id = ${b.requestId} and r.status = 'accepted' and (r.user_id = ${me} or p.user_id = ${me})`;
    if (!rows.length) return json({ error: "권한이 없습니다." }, 403);
    if (!rows[0].passed) return json({ error: "카풀이 끝난 뒤에 별점을 남길 수 있습니다." }, 400);
    const ratee = rows[0].owner_id === me ? rows[0].req_id : rows[0].owner_id;
    await sql`insert into reviews (request_id, rater, ratee, stars) values (${b.requestId}, ${me}, ${ratee}, ${stars})
              on conflict (request_id, rater) do update set stars = excluded.stars`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
