import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, photoUrl, reasonOf } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 내가 차단한 회원 목록 */
export async function GET() {
  const me = await currentUserId();
  if (!me) return needLogin();
  try {
    await ensureSchema();
    const rows = await db()`
      select u.id, u.name, u.photo_v from blocks b join users u on u.id = b.blocked
      where b.blocker = ${me} order by b.created_at desc limit 200`;
    return json({ blocks: rows.map((r) => ({ id: r.id, name: r.name || "회원", photo: photoUrl(r.id, r.photo_v) })) });
  } catch (e) {
    return fail(e);
  }
}

/** 회원 차단. 차단하면 서로의 글·신청·대화가 보이지 않고, 진행 중이던 신청은 정리된다. */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.userId) || b.userId === me) return json({ error: "잘못된 요청입니다." }, 400);
  const why = reasonOf(b);
  if ("error" in why) return json({ error: why.error }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const target = await sql`select 1 from users where id = ${b.userId}`;
    if (!target.length) return json({ error: "잘못된 요청입니다." }, 400);
    const n = await sql`select count(*)::int as n from blocks where blocker = ${me}`;
    if ((n[0].n as number) >= 200) return json({ error: "차단은 200명까지 할 수 있습니다." }, 429);
    await sql`insert into blocks (blocker, blocked, reason, detail) values (${me}, ${b.userId}, ${why.reason}, ${why.detail})
              on conflict (blocker, blocked) do update set reason = excluded.reason, detail = excluded.detail`;
    // 두 사람 사이에 아직 수락되지 않은 신청은 지운다.
    await sql`
      delete from requests r using posts p
      where p.id = r.post_id and r.status = 'pending'
        and ((r.user_id = ${me} and p.user_id = ${b.userId}) or (r.user_id = ${b.userId} and p.user_id = ${me}))`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 차단 해제 */
export async function DELETE(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const u = new URL(req.url).searchParams.get("u");
  if (!isUuid(u)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from blocks where blocker = ${me} and blocked = ${u}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
