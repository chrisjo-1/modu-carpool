import { REASON_LABEL, getRules, grant, grantLegacy, kstDay } from "@/lib/credits";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 내 크레딧: 잔액, 기준, 오늘 출석 여부, 최근 내역 */
export async function GET(req: Request) {
  const me = await currentUserId();
  const q = new URL(req.url).searchParams;
  try {
    await ensureSchema();
    // 로그인 전에는 안내용으로 기준만 알려 준다.
    if (!me) return json({ rules: await getRules() });
    // 내역은 늘어나므로 따로, 20건씩 이어서 받는다(before = 마지막으로 받은 id).
    if (q.get("history")) {
      const before = /^\d{1,18}$/.test(q.get("before") ?? "") ? String(q.get("before")) : null;
      const rows = before
        ? await db()`select id, amount, reason, memo, created_at from credit_ledger where user_id = ${me} and id < ${before} order by id desc limit 21`
        : await db()`select id, amount, reason, memo, created_at from credit_ledger where user_id = ${me} order by id desc limit 21`;
      return json({
        items: rows.slice(0, 20).map((h) => ({ id: String(h.id), amount: h.amount, reason: h.reason, label: REASON_LABEL[String(h.reason)] ?? String(h.reason), memo: h.memo, at: new Date(h.created_at as string).getTime() })),
        more: rows.length > 20,
      });
    }
    // 크레딧 도입 전에 가입한 회원도 가입 축하(와 워프 이전) 크레딧을 한 번 받는다.
    const welcome = (await grant(me, "signup")) + (await grantLegacy(me));
    const sql = db();
    const [u, today, count, rules] = await Promise.all([
      sql`select credits, warp_no, exists(select 1 from legacy_members l where l.matched_user = users.id) as claimed from users where id = ${me}`,
      sql`select 1 from credit_ledger where user_id = ${me} and reason = 'attend' and day = ${kstDay()}`,
      sql`select count(*)::int as n from credit_ledger where user_id = ${me}`,
      getRules(),
    ]);
    return json({
      balance: Number(u[0]?.credits ?? 0),
      attended: today.length > 0,
      welcome,
      rules,
      historyCount: Number(count[0]?.n ?? 0),
      // 워프 번호 질문을 숨길지: '아니오'로 답했거나 이미 워프 번호가 연결된 회원
      warpHidden: u[0]?.warp_no === true || u[0]?.claimed === true,
    });
  } catch (e) {
    return fail(e);
  }
}

/** 출석하기 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (b.action === "claimWarp") return claimWarp(me, b.code);
  if (b.action === "warpNo") {
    try {
      await ensureSchema();
      await db()`update users set warp_no = true where id = ${me}`;
      return json({ ok: true });
    } catch (e) {
      return fail(e);
    }
  }
  if (b.action !== "attend") return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const added = await grant(me, "attend");
    if (!added) return json({ error: "오늘은 이미 출석했어요. 내일 다시 와 주세요." }, 409);
    const u = await db()`select credits from users where id = ${me}`;
    return json({ ok: true, added, balance: Number(u[0].credits) });
  } catch (e) {
    return fail(e);
  }
}

/** 워프 회원 번호 입력: 등록된 번호면 한 번만 이전 축하 크레딧을 준다. 번호를 쓴 회원에게 연결된다. */
async function claimWarp(me: string, raw: unknown) {
  const code = String(raw ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return json({ error: "워프 고유번호 8자리를 입력해 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const me0 = await sql`select email_verified from users where id = ${me}`;
    if (!me0.length) return json({ error: "회원 정보를 찾을 수 없어요." }, 404);
    if (me0[0].email_verified === false) return json({ error: "이메일 인증을 마친 뒤에 받을 수 있어요." }, 400);
    const hit = await sql`select warp_id, withdrawn, matched_user from legacy_members where upper(warp_id) = ${code} limit 1`;
    if (!hit.length) return json({ error: "등록된 워프 고유번호가 아니에요. 번호를 다시 확인해 주세요." }, 404);
    if (hit[0].withdrawn === true) return json({ error: "탈퇴한 회원의 번호는 사용할 수 없어요." }, 400);
    if (hit[0].matched_user && String(hit[0].matched_user) !== me) return json({ error: "이미 다른 회원이 사용한 번호예요." }, 409);
    // 아직 연결되지 않았거나 내 계정에 이미 연결된 번호만 바꾼다(동시에 두 사람이 받는 것을 막는다).
    const claimed = await sql`update legacy_members set matched_user = ${me}, match_status = '가입됨', matched_by = '번호입력'
      where upper(warp_id) = ${code} and (matched_user is null or matched_user = ${me}) returning warp_id`;
    if (!claimed.length) return json({ error: "이미 다른 회원이 사용한 번호예요." }, 409);
    const added = await grantLegacy(me);
    if (!added) return json({ error: "이미 워프 이전 크레딧을 받았어요." }, 409);
    const u = await sql`select credits from users where id = ${me}`;
    return json({ ok: true, added, balance: Number(u[0].credits) });
  } catch (e) {
    return fail(e);
  }
}
