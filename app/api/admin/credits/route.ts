import { DEFAULT_RULES, REASON_LABEL, adjust, getRules, type Rules } from "@/lib/credits";
import { body, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 기준, 합계, 최근 내역(?q= 이메일·닉네임) */
export async function GET(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const q = text(new URL(req.url).searchParams.get("q"), 60).toLowerCase();
  const like = `%${q}%`;
  try {
    await ensureSchema();
    const sql = db();
    const [rules, totals, ledger] = await Promise.all([
      getRules(),
      sql`select coalesce(sum(amount) filter (where amount > 0), 0)::bigint as issued,
                 coalesce(-sum(amount) filter (where amount < 0), 0)::bigint as used,
                 (select coalesce(sum(credits), 0)::bigint from users) as balance,
                 count(*) filter (where reason = 'attend' and day = to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'))::int as attend_today
          from credit_ledger`,
      sql`select l.id, l.amount, l.reason, l.memo, l.created_at, u.id as user_id, u.name, u.email, u.credits
          from credit_ledger l join users u on u.id = l.user_id
          where ${q} = '' or u.email ilike ${like} or u.name ilike ${like}
          order by l.id desc limit 150`,
    ]);
    return json({
      rules,
      labels: REASON_LABEL,
      totals: { issued: Number(totals[0].issued), used: Number(totals[0].used), balance: Number(totals[0].balance), attendToday: totals[0].attend_today },
      ledger: ledger.map((l) => ({ ...l, id: Number(l.id), created_at: new Date(l.created_at as string).getTime() })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** 기준 바꾸기 */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const next = {} as Rules;
  for (const k of Object.keys(DEFAULT_RULES) as (keyof Rules)[]) {
    const v = Math.round(Number(b[k]));
    if (!Number.isInteger(v) || v < 0 || v > 1_000_000) return json({ error: "크레딧은 0 ~ 1,000,000 사이 정수로 입력해 주세요." }, 400);
    next[k] = v;
  }
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values ('credit_rules', ${JSON.stringify(next)}) on conflict (key) do update set value = excluded.value`;
    return json({ ok: true, rules: next });
  } catch (e) {
    return fail(e);
  }
}

/** 회원에게 지급(+)·회수(-): {email 또는 userId, amount, memo} */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const amount = Math.round(Number(b.amount));
  const memo = text(b.memo, 100);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return json({ error: "금액을 확인해 주세요. (예: 1000 지급, -500 회수)" }, 400);
  if (memo.length < 2) return json({ error: "사유를 2자 이상 적어 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const email = text(b.email, 120).toLowerCase();
    const u = isUuid(b.userId) ? await sql`select id from users where id = ${b.userId}` : await sql`select id from users where email = ${email}`;
    if (!u.length) return json({ error: "회원을 찾지 못했습니다." }, 404);
    const credits = await adjust(String(u[0].id), amount, memo);
    return json({ ok: true, credits });
  } catch (e) {
    return fail(e);
  }
}
