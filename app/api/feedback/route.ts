import { FEEDBACK_CATS, SAFETY_FEEDBACK, SAFETY_RATINGS, WARP_CREDIT_MAX, catLabel } from "@/lib/feedback";
import { alertAdmin } from "@/lib/adminAlert";
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
  const category = FEEDBACK_CATS.some(([k]) => k === b.category) || b.category === SAFETY_FEEDBACK ? String(b.category) : "etc";
  // 안심동행 후기: 로그인한 회원, 세 가지 중 하나 + 한 줄 의견(선택)
  const safety = category === SAFETY_FEEDBACK;
  const rating = safety ? SAFETY_RATINGS.find(([k]) => k === b.rating)?.[1] ?? "" : "";
  if (safety && !me) return json({ error: "로그인한 뒤에 보낼 수 있어요." }, 401);
  if (safety && !rating) return json({ error: "어떠셨는지 하나를 골라 주세요." }, 400);
  // 크레딧 이관 신청: 워프 고유번호·워프 메일·보유 크레딧. 로그인한 회원만(크레딧은 그 계정으로 지급)
  const credit = category === "credit";
  const warpCode = credit ? text(b.warpCode, 20).toUpperCase().replace(/\s/g, "") : "";
  const warpEmail = credit ? text(b.warpEmail, 120).toLowerCase() : "";
  const warpCredits = credit ? Math.round(Number(String(b.warpCredits ?? "").replace(/[^0-9]/g, ""))) : 0;
  if (credit) {
    if (!me) return json({ error: "크레딧 이관 신청은 로그인한 뒤에 할 수 있어요." }, 401);
    if (!/^[0-9A-Z]{6,12}$/.test(warpCode)) return json({ error: "워프 고유번호를 확인해 주세요. (예: 1234567A)" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(warpEmail)) return json({ error: "워프에 가입한 메일 주소를 확인해 주세요." }, 400);
    if (!(warpCredits >= 1 && warpCredits <= WARP_CREDIT_MAX)) return json({ error: "워프에서 보유한 크레딧을 숫자로 적어 주세요." }, 400);
  }
  const note = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
  const msg = credit ? `워프 크레딧 이관 신청 · 고유번호 ${warpCode} · 보유 크레딧 ${warpCredits.toLocaleString("ko-KR")}${note ? `\n${note}` : ""}` : safety ? `[${rating}]${note ? ` ${note.slice(0, 500)}` : ""}` : note;
  if (!credit && !safety && msg.length < 5) return json({ error: "내용을 5자 이상 적어 주세요." }, 400);
  const email = text(b.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  const ip = clientIp(req);
  try {
    await ensureSchema();
    const sql = db();
    const n = await sql`select count(*)::int as n from feedback where (ip = ${ip} or (${me}::uuid is not null and user_id = ${me}::uuid)) and created_at > now() - interval '1 hour'`;
    if ((n[0].n as number) >= 5) return json({ error: "잠시 후 다시 보내 주세요. (1시간에 5건까지)" }, 429);
    if (credit) {
      const done = await sql`select 1 from feedback where category = 'credit' and upper(warp_code) = ${warpCode} and rewarded_at is not null limit 1`;
      if (done.length) return json({ error: "이 고유번호의 크레딧은 이미 옮겨 드렸어요." }, 409);
      const open = await sql`select 1 from feedback where category = 'credit' and user_id = ${me} and rewarded_at is null and status in ('new', 'review') limit 1`;
      if (open.length) return json({ error: "확인 중인 이관 신청이 있어요. 처리되면 알려 드릴게요." }, 409);
    }
    const mine = me ? await sql`select email from users where id = ${me}` : [];
    const replyTo = email || String(mine[0]?.email ?? "");
    await sql`insert into feedback (user_id, email, category, body, ip, warp_code, warp_email, warp_credits)
      values (${me}, ${replyTo}, ${category}, ${msg}, ${ip}, ${warpCode}, ${warpEmail}, ${warpCredits})`;
    await alertAdmin(`[모두의카풀 관리] 의견 접수: ${catLabel(category)}`, [
      ["분류", catLabel(category)],
      ["내용", credit ? `고유번호 ${warpCode} · 보유 크레딧 ${warpCredits.toLocaleString("ko-KR")} (관리자 › 의견에서 확인 후 지급)` : msg],
      ["회신 이메일", replyTo || "없음"],
    ]);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
