import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";
import { repostOn } from "@/lib/features";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 다시 올리기·하루 전 알림 가동 여부, 내일 알림 대상(미리보기), 최근 발송 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const sql = db();
    const [on, t, sent] = await Promise.all([
      repostOn(),
      sql`with t as (select (now() at time zone 'Asia/Seoul')::date + 1 as tomorrow)
        select count(*)::int as targets, count(*) filter (where exists (select 1 from push_subs s where s.user_id = x.user_id and s.paused_at is null))::int as with_push
        from (select distinct p.user_id from posts p join users u on u.id = p.user_id, t
          where not p.regular and not p.demo and p.remind and not u.test and not u.blocked and u.withdrawn_at is null
            and p.depart_at < now() and p.depart_at > now() - interval '35 days'
            and extract(dow from p.depart_at at time zone 'Asia/Seoul') = extract(dow from t.tomorrow)
            and not exists (select 1 from posts q where q.user_id = p.user_id and not q.regular and q.status in ('open', 'progress')
                            and (q.depart_at at time zone 'Asia/Seoul')::date = t.tomorrow)) x`,
      sql`select day::text as day, count(*)::int as n, count(*) filter (where sent > 0)::int as pushed from repost_reminds group by day order by day desc limit 7`,
    ]);
    return json({ on, preview: t[0], recent: sent, cron: !!process.env.CRON_SECRET });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 정책 적용(가동) / 중지 {on} */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  try {
    await ensureSchema();
    const v = b.on === true ? "1" : "0";
    await db()`insert into settings (key, value) values ('repost_on', ${v}) on conflict (key) do update set value = excluded.value`;
    return json({ on: v === "1" });
  } catch (e) {
    return fail(e);
  }
}
