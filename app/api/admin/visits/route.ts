import { db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";
import { sourceLabel } from "@/lib/visitSource";

export const dynamic = "force-dynamic";

/**
 * 관리자 '방문' 탭(2026-11-18 사용자 지시 '오늘 방문자 수·오늘 가입자·접속 경로'). GET ?day=YYYY-MM-DD(한국 날짜, 없으면 오늘).
 * 방문은 site_visits(배포 뒤부터 쌓임), 가입·가입 신청·회원 접속은 users·pending_signups(지난 날도 있음). 테스트 계정은 뺀다.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const q = new URL(req.url).searchParams.get("day") ?? "";
  try {
    await ensureSchema();
    const sql = db();
    const today = String((await sql`select (now() at time zone 'Asia/Seoul')::date::text as d`)[0].d);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
    const from = `${day}T00:00:00+09:00`;

    const [sum] = await sql`
      select count(*)::int as visitors,
        count(*) filter (where v.is_new)::int as first_time,
        count(distinct v.user_id)::int as members,
        coalesce(sum(v.hits), 0)::int as opens,
        count(*) filter (where v.mode = 'app')::int as app, count(*) filter (where v.mode = 'browser')::int as browser,
        count(*) filter (where v.mode = 'pc')::int as pc
      from site_visits v left join users u on u.id = v.user_id
      where v.day = ${day}::date and not coalesce(u.test, false)`;
    const sources = await sql`
      with s as (select v.source, v.vid, v.user_id from site_visits v left join users u on u.id = v.user_id where v.day = ${day}::date and not coalesce(u.test, false))
      select s.source, count(*)::int as visitors, count(distinct s.user_id)::int as members,
        (select count(*)::int from users n where n.created_at >= ${from}::timestamptz and n.created_at < ${from}::timestamptz + interval '1 day'
          and not n.test and n.join_source <> '' and exists (select 1 from s s2 where s2.user_id = n.id and s2.source = s.source)) as signups
      from s group by s.source order by visitors desc`;
    const hours = await sql`select h, count(*)::int as n from site_visits v, generate_series(0, 23) h
      where v.day = ${day}::date and (v.hours >> h) & 1 = 1 group by h order by h`;
    const signups = await sql`
      select u.join_source as src, count(*)::int as n,
        count(*) filter (where not u.pw_reset_required)::int as done
      from users u where u.created_at >= ${from}::timestamptz and u.created_at < ${from}::timestamptz + interval '1 day'
        and not u.test and u.withdrawn_at is null and u.join_source <> '' group by 1 order by 2 desc`;
    // 가입 화면을 거치지 않고 만든 계정(워프동기화·워프 명단·알림톡 임시 계정)은 가입과 따로 센다
    const [temp] = await sql`select count(*)::int as n from users u where u.created_at >= ${from}::timestamptz and u.created_at < ${from}::timestamptz + interval '1 day'
      and not u.test and u.join_source = ''`;
    const [pend] = await sql`select count(*)::int as n from pending_signups p
      where p.created_at >= ${from}::timestamptz and p.created_at < ${from}::timestamptz + interval '1 day'`;
    // 그날 처음으로 비밀번호를 정한(가입을 마친) 워프 임시 계정 — 가입과 따로 센다
    const [warpDone] = await sql`select count(*)::int as n from users u where u.pw_at >= ${from}::timestamptz and u.pw_at < ${from}::timestamptz + interval '1 day'
      and u.created_at < ${from}::timestamptz and not u.test`;
    const [seen] = await sql`select count(*)::int as n from users u where u.last_seen >= ${from}::timestamptz and u.last_seen < ${from}::timestamptz + interval '1 day' and not u.test`;
    const trend = await sql`
      with d as (select generate_series(${day}::date - 13, ${day}::date, interval '1 day')::date as day)
      select d.day::text as day,
        (select count(*)::int from site_visits v where v.day = d.day) as visitors,
        (select count(*)::int from site_visits v where v.day = d.day and v.is_new) as first_time,
        (select count(distinct v.user_id)::int from site_visits v where v.day = d.day) as members,
        (select count(*)::int from users u where (u.created_at at time zone 'Asia/Seoul')::date = d.day and not u.test and u.join_source <> '') as signups,
        (select count(*)::int from users u where (u.created_at at time zone 'Asia/Seoul')::date = d.day and not u.test and u.join_source = '') as temp_created,
        (select count(*)::int from pending_signups p where (p.created_at at time zone 'Asia/Seoul')::date = d.day) as pending
      from d order by d.day desc`;
    const [since] = await sql`select min(day)::text as d from site_visits`;
    return json({
      day, today, trackingSince: since?.d ?? null,
      summary: { ...sum, membersSeen: Number(seen?.n ?? 0), signupRequests: Number(pend?.n ?? 0), warpFinished: Number(warpDone?.n ?? 0), tempCreated: Number(temp?.n ?? 0) },
      sources: sources.map((r) => ({ source: String(r.source), label: sourceLabel(String(r.source)), visitors: r.visitors, members: r.members, signups: r.signups })),
      hours: Array.from({ length: 24 }, (_, h) => Number(hours.find((r) => Number(r.h) === h)?.n ?? 0)),
      signups, trend,
    });
  } catch (e) {
    return fail(e);
  }
}
