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
      sql`select f.*, u.name, u.email as user_email,
            l.warp_id as l_code, l.email_norm as l_email, l.matched_user as l_user, l.joined_on as l_joined, l.withdrawn as l_out,
            (select count(*)::int from feedback p where p.category = 'credit' and upper(p.warp_code) = upper(f.warp_code) and p.rewarded_at is not null and p.id <> f.id) as code_paid
          from feedback f left join users u on u.id = f.user_id
          left join lateral (select * from legacy_members l where f.category = 'credit' and f.warp_code <> '' and upper(l.warp_id) = upper(f.warp_code) limit 1) l on true
          where ${status} = '' or f.status = ${status} order by (f.status = 'new') desc, f.id desc limit 200`,
      sql`select status, count(*)::int as n from feedback group by status`,
    ]);
    return json({
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      items: rows.map((r) => ({ id: Number(r.id), name: r.name ?? "", email: r.email, member: !!r.user_id, category: r.category, body: r.body, status: r.status, reply: r.reply, reward: Number(r.reward ?? 0), rewardedAt: r.rewarded_at ? new Date(r.rewarded_at as string).getTime() : 0, at: new Date(r.created_at as string).getTime(),
        // 크레딧 이관 신청 대조: 워프 명단(legacy_members)에 고유번호가 있는지, 메일이 같은지, 신청한 계정과 이어진 사람인지, 이미 지급한 고유번호인지
        warp: r.category === "credit" ? {
          code: String(r.warp_code ?? ""), email: String(r.warp_email ?? ""), credits: Number(r.warp_credits ?? 0),
          found: !!r.l_code,
          emailMatch: !!r.l_email && String(r.l_email) === String(r.warp_email ?? "").toLowerCase(),
          sameAccount: !!r.user_id && ((!!r.l_user && String(r.l_user) === String(r.user_id)) || String(r.user_email ?? "").toLowerCase() === String(r.warp_email ?? "").toLowerCase()),
          joined: r.l_joined ? String(r.l_joined).slice(0, 10) : "",
          withdrawn: !!r.l_out,
          codePaid: Number(r.code_paid ?? 0) > 0,
        } : null })),
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
