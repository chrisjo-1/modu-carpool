import { DEFAULT_POLICY, getPolicy, type MailPolicy } from "@/lib/mail";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";

const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);
const KINDS = ["reset", "verify", "legacy-confirm", "nudge", "notify-request", "notify-accepted", "notify-hello", "withdraw", "purge", "suspend"];

/** 메일 발송 이력과 정책. ?status=&category=&kind=&q=&limit= 로 거른다. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const p = new URL(req.url).searchParams;
  const status = text(p.get("status") ?? "", 20);
  const category = text(p.get("category") ?? "", 20);
  const kind = text(p.get("kind") ?? "", 30);
  const q = text(p.get("q") ?? "", 80);
  const like = `%${q}%`;
  const limit = Math.min(Math.max(Number(p.get("limit")) || 300, 1), 1000);
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`
      select l.id, l.created_at, l.kind, l.category, l.to_email, l.subject, l.status, l.error, l.provider_id, u.name as user_name
      from mail_log l left join users u on u.id = l.user_id
      where (${status} = '' or l.status = ${status})
        and (${category} = '' or l.category = ${category})
        and (${kind} = '' or l.kind = ${kind})
        and (${q} = '' or l.to_email ilike ${like} or l.subject ilike ${like})
      order by l.created_at desc limit ${limit}`;
    const today = await sql`
      select count(*) filter (where status = 'sent')::int as sent,
             count(*) filter (where status = 'sent' and category = 'marketing')::int as marketing_sent,
             count(*) filter (where status = 'sent' and campaign_id is not null)::int as campaign_sent,
             count(*) filter (where status = 'blocked')::int as blocked,
             count(*) filter (where status = 'failed')::int as failed
      from mail_log where created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')`;
    const sup = await sql`select count(*)::int as n from mail_suppressions`;
    // 메일로 접수된 요청: 수신거부 링크, 탈퇴·개인정보 삭제 확인 링크(주소 기준 중복 없이)
    const rec = await sql`select
        (select count(*)::int from mail_suppressions where reason = 'unsubscribe') as unsub,
        (select count(distinct email_norm)::int from withdraw_claims where kind = 'withdraw' and used) as withdrawn,
        (select count(distinct email_norm)::int from withdraw_claims where kind = 'purge' and used) as purged,
        (select count(distinct email_norm)::int from withdraw_claims where not used and expires_at > now()) as waiting`;
    const policy = await getPolicy();
    return json({
      policy,
      defaults: DEFAULT_POLICY,
      kinds: KINDS,
      today: today[0],
      suppressed: sup[0].n,
      received: { unsub: rec[0].unsub, withdrawn: rec[0].withdrawn, purged: rec[0].purged, waiting: rec[0].waiting },
      logs: rows.map((r) => ({ ...r, created_at: new Date(r.created_at as string).getTime() })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** 정책 저장. 광고성 메일 허용, 하루 한도, 야간 제한, 수신 동의 확인 */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const cur = await getPolicy();
  const next: MailPolicy = {
    dailyCap: typeof b.dailyCap === "number" ? Math.round(b.dailyCap) : cur.dailyCap,
    quietOn: typeof b.quietOn === "boolean" ? b.quietOn : cur.quietOn,
    quietFrom: typeof b.quietFrom === "number" ? Math.round(b.quietFrom) : cur.quietFrom,
    quietTo: typeof b.quietTo === "number" ? Math.round(b.quietTo) : cur.quietTo,
    marketingOn: typeof b.marketingOn === "boolean" ? b.marketingOn : cur.marketingOn,
    requireConsent: typeof b.requireConsent === "boolean" ? b.requireConsent : cur.requireConsent,
  };
  if (!Number.isFinite(next.dailyCap) || next.dailyCap < 0 || next.dailyCap > 100000) return json({ error: "하루 한도는 0~100000 사이로 입력해 주세요." }, 400);
  if (![next.quietFrom, next.quietTo].every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) return json({ error: "야간 제한 시간은 0~23시 사이로 입력해 주세요." }, 400);
  try {
    await ensureSchema();
    await db()`update mail_policy set daily_cap = ${next.dailyCap}, quiet_on = ${next.quietOn}, quiet_from = ${next.quietFrom}, quiet_to = ${next.quietTo},
      marketing_on = ${next.marketingOn}, require_consent = ${next.requireConsent}, updated_at = now() where id = 1`;
    return json({ ok: true, policy: next });
  } catch (e) {
    return fail(e);
  }
}
