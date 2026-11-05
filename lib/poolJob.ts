import { campaignQuietNow, deliver, warpPostedMail } from "./mail";
import { db } from "./server";
import { fillWarpGeo, publishWarpPools } from "./warpPool";

/**
 * 정기 매칭(워프 명단) 일괄 게시 + 본인 메일(2026-11-05 사용자 지시: 약 6천 건, 메일은 다음 날 오전 9시쯤부터).
 * settings 'pool_job' = { on, mailAfter }. 사이트 접속 응답 뒤 3분에 한 번:
 *   1) 위치·이메일이 있는 아직 안 올린 행을 40건씩 정기카풀로 올린다(무료, publishWarpPools). 한 번 시도한 행은 publish_tried_at으로 다시 고르지 않는다.
 *   2) 올릴 행이 없으면 위치를 조금씩 채운다(fillWarpGeo).
 *   3) mailAfter가 지났고 오전 9시~오후 8시면 올린 글의 본인에게 메일(한 사람 한 통, 한 시간 최대 300통).
 *      이미 워프 안내 메일을 받은 회원은 건너뛴다. 최근 24시간 반송률이 4%를 넘으면 메일만 멈추고 관리자에게 알린다.
 * 홈 목록에서는 이 글들(영문 코드 warp_code)이 실제 회원 글 뒤에 놓인다(/api/posts).
 */

const HOURLY_MAIL = 300;
const BOUNCE_LIMIT = 0.04;
const kstHour = () => new Date(Date.now() + 9 * 3600_000).getUTCHours();
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);

type JobCfg = { on?: boolean; mailAfter?: string };
async function getSetting(key: string): Promise<string | null> {
  const r = await db()`select value from settings where key = ${key}`;
  return r.length ? String(r[0].value) : null;
}
async function setSetting(key: string, value: string) {
  await db()`insert into settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value`;
}
export async function getJobCfg(): Promise<JobCfg> {
  try {
    return JSON.parse((await getSetting("pool_job")) ?? "{}") as JobCfg;
  } catch {
    return {};
  }
}
export async function setJobCfg(cfg: JobCfg) {
  await setSetting("pool_job", JSON.stringify(cfg));
}

export async function poolJobState() {
  const sql = db();
  const r = await sql`select
      count(*)::int as total,
      count(*) filter (where post_id is not null)::int as posted,
      count(*) filter (where post_id is null and publish_tried_at is null and active and work <> '' and home_lat is not null and work_lat is not null)::int as ready,
      count(*) filter (where post_id is null and (home_lat is null or (work <> '' and work_lat is null)) and geo_tried_at is null)::int as geo_wait,
      count(*) filter (where post_id is null and publish_tried_at is not null)::int as skipped,
      count(*) filter (where post_id is not null and mailed_at is not null)::int as mailed,
      count(*) filter (where post_id is not null and mailed_at is null)::int as mail_wait
    from warp_pools`;
  const bounce = await mailBounce();
  return { cfg: await getJobCfg(), mailPaused: (await getSetting("pool_job_mail_paused")) ?? "", ...r[0], bounce };
}

async function mailBounce() {
  const r = await db()`select count(*)::int as sent, count(bounced_at)::int as bounced from mail_log
    where kind = 'notify-warp-posted' and status = 'sent' and created_at > now() - interval '24 hours'`;
  const sent = Number(r[0]?.sent ?? 0);
  const bounced = Number(r[0]?.bounced ?? 0);
  return { sent, bounced, rate: sent >= 200 ? bounced / sent : null };
}

export async function runPoolJob() {
  const cfg = await getJobCfg();
  if (!cfg.on) return { skipped: "off" };
  const sql = db();
  const out = { posted: 0, geo: 0, mailed: 0 };

  // 1) 올릴 수 있는 행 40건
  const ready = await sql`update warp_pools set publish_tried_at = now()
    where code in (select code from warp_pools where post_id is null and publish_tried_at is null and active and work <> ''
                   and home_lat is not null and work_lat is not null order by reg_date desc, code limit 40)
    returning code`;
  if (ready.length) {
    const r = await publishWarpPools(ready.map((x) => String(x.code)), "free", 0);
    out.posted = r.posted;
  } else {
    // 2) 올릴 게 없으면 위치 채우기(약 8초)
    const g = await fillWarpGeo(16_000).catch(() => null);
    out.geo = g?.done ?? 0;
  }

  // 3) 메일
  const mailAfter = cfg.mailAfter ? Date.parse(cfg.mailAfter) : NaN;
  const h = kstHour();
  if (Number.isFinite(mailAfter) && Date.now() >= mailAfter && h >= 9 && h < 20 && !campaignQuietNow() && !(await getSetting("pool_job_mail_paused"))) {
    const b = await mailBounce();
    if (b.rate !== null && b.rate > BOUNCE_LIMIT) {
      const reason = `정기 매칭 안내 메일의 최근 24시간 반송률이 ${(b.rate * 100).toFixed(1)}%(보낸 ${b.sent}통 중 반송 ${b.bounced}통)로 기준 4%를 넘어 메일을 멈췄어요.`;
      await setSetting("pool_job_mail_paused", reason);
      for (const to of adminEmails()) {
        await deliver({ kind: "pool-job-paused", category: "transactional", to, subject: "[모두의카풀 관리자] 정기 매칭 안내 메일을 멈췄어요", html: `<p>${reason}</p><p>관리자 › 정기 매칭에서 확인 후 [메일 다시 켜기]를 눌러 주세요.</p>`, text: `${reason}\n관리자 › 정기 매칭에서 확인 후 [메일 다시 켜기]를 눌러 주세요.` }).catch(() => false);
      }
      return out;
    }
    const lastHour = await sql`select count(*)::int as n from warp_pools where mailed_at > now() - interval '1 hour'`;
    const room = Math.max(0, Math.min(15, HOURLY_MAIL - Number(lastHour[0].n)));
    if (room > 0) {
      const due = await sql`select w.code, p.user_id, p.origin, p.dest from warp_pools w join posts p on p.id = w.post_id
        where w.mailed_at is null order by w.post_id limit ${room}`;
      for (const d of due) {
        const uid = String(d.user_id);
        // 이미 워프 안내 메일을 받은 회원(워프동기화 등)은 다시 보내지 않는다
        const got = await sql`select 1 from mail_log where user_id = ${uid} and kind = 'notify-warp-posted' and status = 'sent' limit 1`;
        const sent = got.length ? false : await warpPostedMail(uid, [{ route: `[정기] ${d.origin} → ${d.dest}`, over: false }]);
        await sql`update warp_pools set mailed_at = now() where code = ${d.code}`;
        if (sent) out.mailed += 1;
      }
    }
  }
  return out;
}

let lastTry = 0;
/** GET /api/posts 응답 뒤에 부른다. 3분에 한 번(인스턴스 + DB 기록으로 겹치지 않게). */
export async function maybeRunPoolJob() {
  if (Date.now() - lastTry < 60_000) return;
  lastTry = Date.now();
  const cfg = await getJobCfg();
  if (!cfg.on) return;
  const claim = await db()`insert into settings (key, value) values ('pool_job_at', ${String(Date.now())})
    on conflict (key) do update set value = excluded.value
    where settings.value::bigint < ${Date.now() - 180_000} returning value`;
  if (claim.length) await runPoolJob();
}
