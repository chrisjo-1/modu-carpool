import { warpCreditMail } from "@/lib/mail";
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
  if (!(id > 0)) return json({ error: "잘못된 요청입니다." }, 400);
  if (b.warp) return payWarp(id);
  const amount = Math.round(Number(b.amount));
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

/**
 * 워프 크레딧 이관 신청 지급 {id, warp: true}: 회원이 적은 보유 크레딧만큼 한 번에 지급하고, 답변·상태를 '반영'으로 바꾸고, 푸시와 메일로 알린다.
 * 같은 워프 고유번호는 한 번만(feedback_warp_paid_uniq), 신청 한 건도 한 번만 지급한다.
 */
async function payWarp(id: number) {
  try {
    await ensureSchema();
    const sql = db();
    const f = await sql`select id, user_id, warp_code, warp_credits, rewarded_at, category from feedback where id = ${id}`;
    if (!f.length || f[0].category !== "credit") return json({ error: "크레딧 이관 신청이 아니에요." }, 400);
    if (!f[0].user_id) return json({ error: "회원 계정이 없는 신청이에요." }, 400);
    if (f[0].rewarded_at) return json({ error: "이미 지급한 신청이에요." }, 409);
    const amount = Number(f[0].warp_credits ?? 0);
    const code = String(f[0].warp_code ?? "");
    if (!(amount >= 1)) return json({ error: "신청한 크레딧이 없어요." }, 400);
    const reply = `워프 크레딧 ${amount.toLocaleString("ko-KR")}을 모두의카풀 크레딧으로 옮겨 드렸어요. 내 정보 › 크레딧에서 확인해 주세요.`;
    let rows;
    try {
      rows = await sql`
        with c as (
          update feedback set reward = ${amount}, rewarded_at = now(), status = 'done', reply = ${reply}, replied_at = now()
          where id = ${id} and rewarded_at is null and user_id is not null
          returning user_id),
        l as (
          insert into credit_ledger (user_id, amount, reason, memo)
          select user_id, ${amount}, 'warp_credit', ${`워프 고유번호 ${code} 크레딧 이관 (신청 #${id})`} from c
          returning user_id),
        u as (
          update users set credits = credits + ${amount} where id in (select user_id from l) returning id)
        select id from u`;
    } catch (e) {
      if (String((e as { code?: string }).code) === "23505" || /feedback_warp_paid_uniq/.test(String(e))) return json({ error: "이 고유번호의 크레딧은 이미 지급했어요." }, 409);
      throw e;
    }
    if (!rows.length) return json({ error: "이미 지급한 신청이에요." }, 409);
    const userId = String(rows[0].id);
    const pushed = await sendPush(userId, {
      title: `워프 크레딧 이관 완료 +${amount.toLocaleString("ko-KR")}`,
      body: "워프에서 쓰던 크레딧을 모두의카풀로 옮겨 드렸어요. 내 정보에서 확인해 보세요.",
      url: "/?tab=me",
      tag: `warp-credit-${id}`,
    }).catch(() => 0);
    const mailed = await warpCreditMail(userId, amount);
    return json({ ok: true, amount, pushed, mailed });
  } catch (e) {
    return fail(e);
  }
}
