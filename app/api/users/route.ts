import { currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, photoUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 회원 프로필: 소개, 별점 평균, 지난 카풀 목록. 연락처와 이메일은 내려주지 않는다. */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const id = new URL(req.url).searchParams.get("u");
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const u = await sql`select name, bio, photo_v, blocked from users where id = ${id}`;
    if (!u.length || u[0].blocked) return json({ error: "회원을 찾을 수 없습니다." }, 404);
    const rating = await sql`select coalesce(avg(stars), 0)::float as avg, count(*)::int as n from reviews where ratee = ${id}`;
    // 수락까지 된 카풀 가운데 출발 시각이 지난 것(정기카풀은 수락된 것)
    const history = await sql`
      select p.origin, p.dest, p.depart_at, p.regular, p.role, (p.user_id = ${id}) as owner
      from requests r join posts p on p.id = r.post_id
      where r.status = 'accepted' and (p.user_id = ${id} or r.user_id = ${id}) and (p.regular or p.depart_at < now())
      order by p.depart_at desc limit 20`;
    const mine = await sql`select 1 from blocks where blocker = ${me} and blocked = ${id}`;
    return json({
      member: {
        id,
        name: u[0].name || "회원",
        bio: u[0].bio,
        photo: photoUrl(id, u[0].photo_v),
        me: id === me,
        blockedByMe: mine.length > 0,
        rating: { avg: Math.round(Number(rating[0].avg) * 10) / 10, count: rating[0].n },
        history: history.map((h) => ({
          origin: h.origin,
          dest: h.dest,
          at: new Date(h.depart_at as string).getTime(),
          regular: h.regular,
          // 글을 올린 사람이면 글의 역할 그대로, 신청한 사람이면 반대 역할
          role: h.owner ? h.role : h.role === "driver" ? "rider" : "driver",
        })),
      },
    });
  } catch (e) {
    return fail(e);
  }
}
