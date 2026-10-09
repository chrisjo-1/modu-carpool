import { FEEDBACK_STATUS } from "@/lib/feedback";
import { sendPush } from "@/lib/push";
import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

export async function GET(req: Request) {
  if (!(await isAdmin())) return denied();
  const status = new URL(req.url).searchParams.get("status") ?? "";
  try {
    await ensureSchema();
    const sql = db();
    const [rows, counts] = await Promise.all([
      sql`select f.*, u.name from feedback f left join users u on u.id = f.user_id
          where ${status} = '' or f.status = ${status} order by (f.status = 'new') desc, f.id desc limit 200`,
      sql`select status, count(*)::int as n from feedback group by status`,
    ]);
    return json({
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      items: rows.map((r) => ({ id: Number(r.id), name: r.name ?? "", email: r.email, member: !!r.user_id, category: r.category, body: r.body, status: r.status, reply: r.reply, at: new Date(r.created_at as string).getTime() })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** 상태·답변 저장 {id, status, reply}. 답변이 새로 달리면 회원에게 푸시로 알린다. */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const id = Math.round(Number(b.id));
  if (!(id > 0)) return json({ error: "잘못된 요청입니다." }, 400);
  const status = FEEDBACK_STATUS.some(([k]) => k === b.status) ? String(b.status) : "new";
  const reply = typeof b.reply === "string" ? b.reply.trim().slice(0, 2000) : "";
  try {
    await ensureSchema();
    const sql = db();
    const before = await sql`select user_id, reply from feedback where id = ${id}`;
    if (!before.length) return json({ error: "없는 의견입니다." }, 404);
    await sql`update feedback set status = ${status}, reply = ${reply}, replied_at = case when ${reply} <> '' and reply <> ${reply} then now() else replied_at end where id = ${id}`;
    if (reply && reply !== before[0].reply && before[0].user_id)
      await sendPush(String(before[0].user_id), { title: "보내 주신 의견에 답변이 달렸어요", body: reply.slice(0, 120), url: "/?feedback=1", tag: `fb-${id}` });
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
