import { randomBytes, createHash } from "node:crypto";
import { sendVerifyMail, siteUrl } from "@/lib/mail";
import { startVerify } from "@/lib/verify";
import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const PENDING_DAYS = 14;

/**
 * 가입 → 첫 글 현황(테스트·탈퇴 제외).
 * - 신규 가입(워프 연결 없음)과 워프 연결 회원을 나눠 글 있는 사람·출퇴근만 저장한 사람·아무것도 없는 사람을 센다.
 * - 인증 대기: 가입 신청 후 인증 메일을 누르지 않은 사람(최근 14일, 아직 계정 없음)과 인증 안 된 기존 계정.
 */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const r = await db()`
      with base as (
        select u.id,
          exists (select 1 from legacy_members l where l.matched_user = u.id) as warp,
          exists (select 1 from posts p where p.user_id = u.id) as has_post,
          (u.commute_kind = 'commute' and coalesce(u.commute_origin, '') <> '') as commute_saved,
          (u.photo_v > 0) as has_photo
        from users u where not u.test and u.withdrawn_at is null
      )
      select
        count(*) filter (where not warp)::int as new_total,
        count(*) filter (where not warp and has_post)::int as new_posted,
        count(*) filter (where not warp and not has_post and commute_saved)::int as new_saved_only,
        count(*) filter (where not warp and not has_post and not commute_saved)::int as new_nothing,
        count(*) filter (where warp)::int as warp_total,
        count(*) filter (where warp and has_post)::int as warp_posted,
        count(*) filter (where not has_post and commute_saved and not has_photo)::int as saved_no_photo,
        (select count(*)::int from pending_signups p where p.created_at > now() - make_interval(days => ${PENDING_DAYS})
           and not exists (select 1 from users x where lower(x.email) = lower(p.email))) as pending,
        (select count(*)::int from users x where not x.test and x.withdrawn_at is null and not x.email_verified) as unverified
      from base`;
    return json({ ...r[0], pendingDays: PENDING_DAYS });
  } catch (e) {
    return fail(e);
  }
}

/**
 * 인증 메일 다시 보내기. 한 번에 최대 200명.
 * - 가입 신청만 하고 인증하지 않은 사람: 새 링크(72시간)로 바꿔 보낸다. 같은 사람에게는 하루 한 번만.
 * - 인증 안 된 기존 계정: 보통 인증 메일(1시간 3번 제한은 그대로).
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const b = await body(req);
  const limit = Math.min(Math.max(Number(b.limit) || 200, 1), 200);
  const started = Date.now();
  try {
    await ensureSchema();
    const sql = db();
    let sent = 0;
    let failed = 0;
    const pend = await sql`select email from pending_signups p
      where p.created_at > now() - make_interval(days => ${PENDING_DAYS})
        and (p.resent_at is null or p.resent_at < now() - interval '1 day')
        and not exists (select 1 from users x where lower(x.email) = lower(p.email))
      order by p.created_at desc limit ${limit}`;
    for (const p of pend) {
      if (Date.now() - started > 50_000) break;
      const token = randomBytes(32).toString("hex");
      await sql`update pending_signups set token_hash = ${hashToken(token)}, expires_at = now() + interval '72 hours', resent_at = now() where email = ${p.email}`;
      const ok = await sendVerifyMail(String(p.email), `${siteUrl()}/?verify=${token}`).catch(() => false);
      if (ok) sent += 1;
      else failed += 1;
    }
    const room = limit - pend.length;
    if (room > 0 && Date.now() - started < 50_000) {
      const us = await sql`select u.id, u.email from users u
        where not u.test and u.withdrawn_at is null and not u.email_verified
          and not exists (select 1 from email_verifications v where v.user_id = u.id and v.created_at > now() - interval '1 day')
        order by u.created_at desc limit ${room}`;
      for (const u of us) {
        if (Date.now() - started > 50_000) break;
        const r = await startVerify(String(u.id), String(u.email)).catch(() => "nomail" as const);
        if (r === "sent") sent += 1;
        else failed += 1;
      }
    }
    return json({ ok: true, sent, failed });
  } catch (e) {
    return fail(e);
  }
}
