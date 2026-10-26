import { db } from "./server";
import { sendPush } from "./push";
import { slotLabel } from "./repost";

/**
 * 다시 올리기 하루 전 알림(매일 저녁 8시 무렵, 한국 시간).
 * 내일 요일과 같은 요일에 출발했던 최근 5주 안의 1회 카풀 글(알림 켬)을 회원마다 가장 최근 것 하나 골라 푸시한다.
 * 내일 출발하는 글을 이미 올렸거나, 오늘 이미 보냈으면 건너뛴다. 정기카풀·임시글·테스트·차단·탈퇴 회원은 빼고 보낸다.
 */
export async function runRepostReminders(limit = 400): Promise<{ targets: number; pushed: number }> {
  const sql = db();
  const rows = await sql`
    with t as (select (now() at time zone 'Asia/Seoul')::date as today, ((now() at time zone 'Asia/Seoul')::date + 1) as tomorrow)
    select distinct on (p.user_id) p.id, p.user_id, p.origin, p.dest, p.depart_at, p.role
    from posts p join users u on u.id = p.user_id, t
    where not p.regular and not p.demo and p.remind
      and not u.test and not u.blocked and u.withdrawn_at is null
      and p.depart_at < now() and p.depart_at > now() - interval '35 days'
      and extract(dow from p.depart_at at time zone 'Asia/Seoul') = extract(dow from t.tomorrow)
      and not exists (select 1 from posts q where q.user_id = p.user_id and not q.regular and q.status in ('open', 'progress')
                      and (q.depart_at at time zone 'Asia/Seoul')::date = t.tomorrow)
      and not exists (select 1 from repost_reminds r where r.user_id = p.user_id and r.day = t.today)
      and exists (select 1 from push_subs s where s.user_id = p.user_id and s.paused_at is null)
    order by p.user_id, p.depart_at desc
    limit ${limit}`;
  let pushed = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const part = rows.slice(i, i + 20);
    await Promise.all(
      part.map(async (r) => {
        // 먼저 기록해 두 번 보내지 않게 한다(동시에 돌아도 한 번).
        const claim = await sql`insert into repost_reminds (user_id, day, post_id) values (${r.user_id}, (now() at time zone 'Asia/Seoul')::date, ${r.id})
          on conflict do nothing returning user_id`;
        if (!claim.length) return;
        const at = new Date(r.depart_at as string).getTime();
        const n = await sendPush(String(r.user_id), {
          title: "내일도 같은 시간에 카풀하세요?",
          body: `지난 ${slotLabel(at)} ${r.origin} → ${r.dest} 글을 한 번에 다시 올릴 수 있어요.`,
          url: `/?repost=${r.id}`,
          tag: "repost-remind",
        });
        if (n) pushed++;
        await sql`update repost_reminds set sent = ${n} where user_id = ${r.user_id} and day = (now() at time zone 'Asia/Seoul')::date`;
      })
    );
  }
  return { targets: rows.length, pushed };
}

let checkedDay = "";
/**
 * 예약 실행(CRON_SECRET)이 없거나 빠져도 돌도록: 저녁 8시(한국 시간) 이후 첫 요청 때 하루 한 번 실행한다.
 * 서버 인스턴스마다 하루 한 번만 DB를 확인하고, settings 의 날짜로 전체에서 한 번만 실행한다.
 */
export async function maybeRunRepostReminders() {
  const k = new Date(Date.now() + 9 * 3600_000);
  if (k.getUTCHours() < 20) return;
  const day = k.toISOString().slice(0, 10);
  if (checkedDay === day) return;
  checkedDay = day;
  const sql = db();
  const claim = await sql`insert into settings (key, value) values ('repost_remind_day', ${day})
    on conflict (key) do update set value = excluded.value where settings.value < excluded.value returning value`;
  if (claim.length) await runRepostReminders();
}
