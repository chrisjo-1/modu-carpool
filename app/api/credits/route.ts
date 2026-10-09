import { REASON_LABEL, getRules, grant, grantLegacy, kstDay } from "@/lib/credits";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 내 크레딧: 잔액, 기준, 오늘 출석 여부, 최근 내역 */
export async function GET() {
  const me = await currentUserId();
  try {
    await ensureSchema();
    // 로그인 전에는 안내용으로 기준만 알려 준다.
    if (!me) return json({ rules: await getRules() });
    // 크레딧 도입 전에 가입한 회원도 가입 축하(와 워프 이전) 크레딧을 한 번 받는다.
    const welcome = (await grant(me, "signup")) + (await grantLegacy(me));
    const sql = db();
    const [u, today, history, rules] = await Promise.all([
      sql`select credits from users where id = ${me}`,
      sql`select 1 from credit_ledger where user_id = ${me} and reason = 'attend' and day = ${kstDay()}`,
      sql`select amount, reason, memo, created_at from credit_ledger where user_id = ${me} order by id desc limit 30`,
      getRules(),
    ]);
    return json({
      balance: Number(u[0]?.credits ?? 0),
      attended: today.length > 0,
      welcome,
      rules,
      history: history.map((h) => ({ amount: h.amount, reason: h.reason, label: REASON_LABEL[String(h.reason)] ?? String(h.reason), memo: h.memo, at: new Date(h.created_at as string).getTime() })),
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
