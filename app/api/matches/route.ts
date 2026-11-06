import { spend } from "@/lib/credits";
import { matchViewCost, matchesFor } from "@/lib/matchServer";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin, photoUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * GET ?post=글ID — 내 글과 매칭 가능성 있는 회원 글(점수 순).
 * 열람 비용(settings match_view_cost)이 0이면 바로 목록, 0보다 크고 아직 안 냈으면 {locked, cost, count}만.
 * POST {post} — 비용을 내고 열람(같은 글은 한 번만).
 */
async function own(me: string, postId: string) {
  const r = await db()`select 1 from posts where id = ${postId} and user_id = ${me}`;
  return r.length > 0;
}

export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const postId = new URL(req.url).searchParams.get("post") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    if (!(await own(me, postId))) return json({ error: "내 글에서만 볼 수 있어요." }, 403);
    const [{ mine, items }, cost] = await Promise.all([matchesFor(postId), matchViewCost()]);
    if (!mine) return json({ error: "글을 찾을 수 없어요." }, 404);
    const paid = cost > 0 ? (await db()`select 1 from match_views where user_id = ${me} and post_id = ${postId}`).length > 0 : true;
    if (!paid) return json({ locked: true, cost, count: items.length, needDest: mine.workLat == null });
    return json({
      locked: false, cost, count: items.length, needDest: mine.workLat == null,
      items: items.map(({ userId, photoV, ...m }) => ({ ...m, photo: photoUrl(userId, photoV) })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const postId = String(b.post ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    if (!(await own(me, postId))) return json({ error: "내 글에서만 볼 수 있어요." }, 403);
    const cost = await matchViewCost();
    const already = await db()`select 1 from match_views where user_id = ${me} and post_id = ${postId}`;
    if (!already.length) {
      if (cost > 0 && !(await spend(me, cost, "match", `매칭 회원 열람 ${postId.slice(0, 8)}`))) return json({ error: `크레딧이 모자라요. 열람에는 ${cost.toLocaleString("ko-KR")} 크레딧이 필요해요.` }, 402);
      await db()`insert into match_views (user_id, post_id, paid) values (${me}, ${postId}, ${cost}) on conflict do nothing`;
    }
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
