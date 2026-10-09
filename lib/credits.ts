import { db } from "./server";

/** 크레딧 기준(관리자 화면에서 바꿀 수 있다). nudge 는 '메일로 알리기' 1회에 차감하는 양. */
export const DEFAULT_RULES = { signup: 1000, attend: 100, post: 1000, nudge: 500, legacy: 2000 };
export type Rules = typeof DEFAULT_RULES;
export const REASON_LABEL: Record<string, string> = {
  signup: "가입 축하",
  legacy: "워프 회원 이전 축하",
  attend: "출석",
  post: "카풀 게시",
  nudge: "메일로 알리기",
  admin: "운영자 지급·회수",
  refund: "환불",
};

export async function getRules(): Promise<Rules> {
  const rows = await db()`select value from settings where key = 'credit_rules'`;
  try {
    const v = rows.length ? JSON.parse(String(rows[0].value)) : {};
    const out = { ...DEFAULT_RULES };
    for (const k of Object.keys(out) as (keyof Rules)[]) if (Number.isInteger(v[k]) && v[k] >= 0 && v[k] <= 1_000_000) out[k] = v[k];
    return out;
  } catch {
    return { ...DEFAULT_RULES };
  }
}

/** 한국 날짜(YYYY-MM-DD). 출석·게시 적립은 하루 한 번 */
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 적립. 같은 날 같은 사유(출석·게시)나 가입 축하가 이미 있으면 아무것도 하지 않고 0을 돌려준다.
 * 장부 기록과 잔액 변경을 한 문장으로 처리해 중복 지급을 막는다.
 */
export async function grant(userId: string, reason: "signup" | "attend" | "post" | "legacy", memo = ""): Promise<number> {
  const rules = await getRules();
  const amount = rules[reason];
  if (!amount) return 0;
  const day = reason === "signup" || reason === "legacy" ? "" : kstDay();
  const rows = await db()`
    with ins as (
      insert into credit_ledger (user_id, amount, reason, memo, day) values (${userId}, ${amount}, ${reason}, ${memo}, ${day})
      on conflict do nothing returning amount)
    update users set credits = credits + coalesce((select sum(amount) from ins), 0) where id = ${userId}
    returning (select coalesce(sum(amount), 0) from ins)::int as added`;
  return rows.length ? Number(rows[0].added) : 0;
}

/** 차감. 잔액이 모자라면 false. */
export async function spend(userId: string, amount: number, reason: string, memo = ""): Promise<boolean> {
  if (amount <= 0) return true;
  const rows = await db()`
    with u as (update users set credits = credits - ${amount} where id = ${userId} and credits >= ${amount} returning id)
    insert into credit_ledger (user_id, amount, reason, memo) select id, ${-amount}, ${reason}, ${memo} from u returning id`;
  return rows.length > 0;
}

/** 운영자 지급(+)·회수(-). 회수로 잔액이 0 아래로 내려가지는 않는다. */
export async function adjust(userId: string, amount: number, memo: string) {
  // 실제로 바뀐 양(회수는 잔액까지만)을 장부에 남긴다.
  const rows = await db()`
    with o as (select id, credits from users where id = ${userId}),
    u as (update users set credits = o.credits + greatest(${amount}::int, -o.credits) from o where users.id = o.id
          returning users.id, users.credits, greatest(${amount}::int, -o.credits) as delta)
    insert into credit_ledger (user_id, amount, reason, memo) select id, delta, 'admin', ${memo} from u where delta <> 0
    returning (select credits from u) as credits`;
  if (!rows.length) {
    const cur = await db()`select credits from users where id = ${userId}`;
    return cur.length ? Number(cur[0].credits) : null;
  }
  return rows.length ? Number(rows[0].credits) : null;
}

/** 구 워프 회원(가입 이메일 일치)이면 이전 축하 크레딧을 한 번 지급한다. */
export async function grantLegacy(userId: string): Promise<number> {
  const hit = await db()`select 1 from legacy_members l join users u on u.id = l.matched_user where l.matched_user = ${userId} and u.email_verified limit 1`;
  return hit.length ? grant(userId, "legacy") : 0;
}
