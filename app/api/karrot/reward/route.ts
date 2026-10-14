import { currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, body } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 카풀 보상. 탑승자가 같이 탄(수락됐고 출발한) 운전자 글에 대해 당근함 물품을 골라 보내고,
 * 운전자가 받았다고 확인한다. 실제 물건 전달은 당사자끼리 만나서 한다.
 */

/** ?eligible=1: 내가 보상을 보낼 수 있는 카풀 목록 · ?received=1: 내가 받은 보상 */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const sp = new URL(req.url).searchParams;
  try {
    await ensureSchema();
    if (sp.get("received") === "1") {
      const rows = await db()`
        select kr.id, kr.item_title, kr.item_link, kr.status, kr.created_at, kr.confirmed_at, u.name as rider_name,
          p.origin, p.dest, p.depart_at
        from karrot_rewards kr join users u on u.id = kr.rider join posts p on p.id = kr.post_id
        where kr.driver = ${me} order by kr.created_at desc limit 50`;
      return json({ rewards: rows });
    }
    if (sp.get("eligible") === "1") {
      const rows = await db()`
        select p.id as post_id, p.origin, p.dest, p.depart_at, p.regular, kr.id as reward_id, kr.status as reward_status
        from requests r join posts p on p.id = r.post_id
          left join karrot_rewards kr on kr.post_id = p.id and kr.rider = ${me}
        where r.user_id = ${me} and r.status = 'accepted' and p.role = 'driver' and p.user_id <> ${me}
          and (p.regular or p.depart_at < now())
        order by p.depart_at desc limit 50`;
      return json({ posts: rows });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}

/** 보상 보내기: {postId, itemId}. 같은 카풀에는 한 번만 보낼 수 있다. */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.postId) || !isUuid(b.itemId)) return json({ error: "보상할 카풀과 물품을 골라 주세요." }, 400);
  try {
    await ensureSchema();
    const ok = await db()`
      select p.user_id as driver from requests r join posts p on p.id = r.post_id
      where r.post_id = ${b.postId} and r.user_id = ${me} and r.status = 'accepted' and p.role = 'driver' and p.user_id <> ${me}
        and (p.regular or p.depart_at < now())`;
    if (!ok.length) return json({ error: "출발이 끝난 카풀에만 보상을 보낼 수 있어요." }, 400);
    const item = await db()`select id, title, link from karrot_items where id = ${b.itemId}`;
    if (!item.length) return json({ error: "물품을 찾을 수 없어요." }, 404);
    const rows = await db()`
      insert into karrot_rewards (post_id, rider, driver, item_id, item_title, item_link)
      values (${b.postId}, ${me}, ${ok[0].driver}, ${item[0].id}, ${item[0].title}, ${item[0].link})
      on conflict (post_id, rider) do nothing returning id`;
    if (!rows.length) return json({ error: "이 카풀에는 이미 보상을 보냈어요." }, 409);
    return json({ ok: true, id: rows[0].id });
  } catch (e) {
    return fail(e);
  }
}

/** 운전자가 받았다고 확인: {id} */
export async function PATCH(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const rows = await db()`
      update karrot_rewards set status = 'confirmed', confirmed_at = now()
      where id = ${b.id} and driver = ${me} and status = 'chosen' returning id`;
    if (!rows.length) return json({ error: "확인할 보상을 찾을 수 없어요." }, 404);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
