import { sendPush } from "@/lib/push";
import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const MAX_REWARD = 100_000;

/**
 * 의견 보낸 회원에게 크레딧을 바로 지급하고 푸시로 알린다. {id, amount}
 * 의견 한 건당 한 번만 지급한다. 지급과 장부 기록, 잔액 증가를 한 문장으로 처리한다.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const b = await body(req);
  const id = Math.round(Number(b.id));
  const amount = Math.round(Number(b.amount));
  if (!(id > 0)) return json({ error: "잘못된 요청입니다." }, 400);
  if (!(amount >= 1 && amount <= MAX_REWARD)) return json({ error: `지급액은 1~${MAX_REWARD.toLocaleString("ko-KR")} 크레딧 사이로 입력해 주세요.` }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`
      with c as (
        update feedback set reward = ${amount}, rewarded_at = now()
        where id = ${id} and rewarded_at is null and user_id is not null
        returning user_id, id),
      l as (
        insert into credit_ledger (user_id, amount, reason, memo)
        select user_id, ${amount}, 'feedback', ${"의견 #" + id + " 감사"} from c
        returning user_id),
      u as (
        update users set credits = credits + ${amount} where id in (select user_id from l) returning id, name)
      select id, name from u`;
    if (!rows.length) {
      const f = await sql`select user_id, rewarded_at from feedback where id = ${id}`;
      if (!f.length) return json({ error: "없는 의견입니다." }, 404);
      if (!f[0].user_id) return json({ error: "비회원에게는 크레딧을 줄 수 없어요." }, 400);
      return json({ error: "이미 크레딧을 지급한 의견이에요." }, 409);
    }
    const userId = String(rows[0].id ?? "");
    // 푸시는 필수: 회원이 앱을 보지 않는 동안 지급된 크레딧을 알린다. 발송 결과를 함께 돌려준다.
    const pushed = await sendPush(userId, {
      title: `의견 감사 크레딧 +${amount.toLocaleString("ko-KR")}`,
      body: "보내 주신 의견에 감사드려요. 내 정보에서 크레딧을 확인해 보세요.",
      url: "/?tab=me",
      tag: `fb-reward-${id}`,
    });
    return json({ ok: true, amount, pushed });
  } catch (e) {
    return fail(e);
  }
}
