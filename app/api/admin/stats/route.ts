import { db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const DAYS = 30;

/** 관리자 통계: 최근 30일 일별 추이(한국 시간 기준, 테스트 회원 제외)와 누적 합계 */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const sql = db();
    const since = new Date(Date.now() - DAYS * 86400000).toISOString();
    const [signups, posts, requests, accepted, messages, attend, totals] = await Promise.all([
      sql`select to_char((created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, count(*)::int as n
          from users where not test and created_at >= ${since} group by 1`,
      sql`select to_char((p.created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, count(*)::int as n
          from posts p join users u on u.id = p.user_id where not u.test and p.created_at >= ${since} group by 1`,
      sql`select to_char((r.created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, count(*)::int as n
          from requests r join users u on u.id = r.user_id where not u.test and r.created_at >= ${since} group by 1`,
      sql`select to_char((r.created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, count(*)::int as n
          from requests r join users u on u.id = r.user_id where not u.test and r.status = 'accepted' and r.created_at >= ${since} group by 1`,
      sql`select to_char((m.created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, count(*)::int as n
          from messages m join users u on u.id = m.user_id where not u.test and m.created_at >= ${since} group by 1`,
      sql`select to_char((l.created_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day, count(*)::int as n
          from credit_ledger l join users u on u.id = l.user_id where not u.test and l.reason = 'attend' and l.created_at >= ${since} group by 1`,
      sql`select
          (select count(*)::int from users where not test) as users,
          (select count(*)::int from users where not test and email_verified) as verified,
          (select count(*)::int from users where not test and marketing) as marketing,
          (select count(*)::int from posts p join users u on u.id = p.user_id where not u.test) as posts,
          (select count(*)::int from posts p join users u on u.id = p.user_id where not u.test and p.status = 'open' and (p.regular or p.depart_at > now())) as live,
          (select count(*)::int from requests r join users u on u.id = r.user_id where not u.test) as requests,
          (select count(*)::int from requests r join users u on u.id = r.user_id where not u.test and r.status = 'accepted') as accepted,
          (select count(distinct user_id)::int from push_subs) as push,
          (select count(*)::int from route_alerts) as alerts,
          (select count(*)::int from legacy_members where matched_user is not null) as legacy`,
    ]);
    // 오늘까지 30일 날짜 축(한국 시간)
    const days: string[] = [];
    for (let i = DAYS - 1; i >= 0; i--) days.push(new Date(Date.now() + 9 * 3600000 - i * 86400000).toISOString().slice(0, 10));
    const fill = (rows: Record<string, unknown>[]) => {
      const m = new Map(rows.map((r) => [String(r.day), Number(r.n)]));
      return days.map((x) => m.get(x) ?? 0);
    };
    return json({
      days,
      series: { signups: fill(signups), posts: fill(posts), requests: fill(requests), accepted: fill(accepted), messages: fill(messages), attend: fill(attend) },
      totals: totals[0],
    });
  } catch (e) {
    return fail(e);
  }
}
