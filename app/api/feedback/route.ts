import { FEEDBACK_CATS } from "@/lib/feedback";
import { body, clientIp, currentUserId, db, ensureSchema, fail, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 내가 보낸 의견과 답변 */
export async function GET() {
  const me = await currentUserId();
  if (!me) return json({ items: [] });
  try {
    await ensureSchema();
    const rows = await db()`select id, category, body, status, reply, created_at, replied_at from feedback where user_id = ${me} order by id desc limit 30`;
    return json({ items: rows.map((r) => ({ id: Number(r.id), category: r.category, body: r.body, status: r.status, reply: r.reply, at: new Date(r.created_at as string).getTime() })) });
  } catch (e) {
    return fail(e);
  }
}

/** 의견 보내기 {category, body, email?}. 로그인하지 않아도 보낼 수 있다. */
export async function POST(req: Request) {
  const me = await currentUserId();
  const b = await body(req);
  const category = FEEDBACK_CATS.some(([k]) => k === b.category) ? String(b.category) : "etc";
  const msg = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
  if (msg.length < 5) return json({ error: "내용을 5자 이상 적어 주세요." }, 400);
  const email = text(b.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  const ip = clientIp(req);
  try {
    await ensureSchema();
    const sql = db();
    const n = await sql`select count(*)::int as n from feedback where (ip = ${ip} or (${me}::uuid is not null and user_id = ${me}::uuid)) and created_at > now() - interval '1 hour'`;
    if ((n[0].n as number) >= 5) return json({ error: "잠시 후 다시 보내 주세요. (1시간에 5건까지)" }, 429);
    const mine = me ? await sql`select email from users where id = ${me}` : [];
    await sql`insert into feedback (user_id, email, category, body, ip) values (${me}, ${email || String(mine[0]?.email ?? "")}, ${category}, ${msg}, ${ip})`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
