import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, reasonOf } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 회원 신고. 관리자 화면에서 사유와 양쪽 회원을 확인한다. */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.userId) || b.userId === me) return json({ error: "잘못된 요청입니다." }, 400);
  const why = reasonOf(b);
  if ("error" in why) return json({ error: why.error }, 400);
  const requestId = isUuid(b.requestId) ? b.requestId : null;
  try {
    await ensureSchema();
    const sql = db();
    const target = await sql`select 1 from users where id = ${b.userId}`;
    if (!target.length) return json({ error: "잘못된 요청입니다." }, 400);
    const n = await sql`select count(*)::int as n from reports where reporter = ${me} and created_at > now() - interval '1 day'`;
    if ((n[0].n as number) >= 10) return json({ error: "신고는 하루 10건까지 할 수 있습니다." }, 429);
    await sql`insert into reports (reporter, target, reason, detail, request_id) values (${me}, ${b.userId}, ${why.reason}, ${why.detail}, ${requestId})`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
