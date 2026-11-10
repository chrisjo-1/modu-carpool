import { deliver } from "./mail";
import { RETENTION_TEXT, personalize, renderHtml } from "./campaign";
import { runCampaignBatch } from "./campaignRun";
import { db } from "./server";
import { suppress } from "./unsub";

/**
 * 대량 메일 자동 이어 보내기(안전장치판, 2026-11-05 사용자 선택 '나'):
 * - 관리자가 [발송]으로 시작하고 '자동 이어 보내기'를 켠 캠페인만, 하루 몫(campaignAllowance) 안에서 이어 보낸다.
 * - 오전 9시~오후 8시(한국 시각)에만. 밤 9시~아침 8시 금지는 runCampaignBatch에도 있다.
 * - 최근 3일 대량 메일 반송률이 3%를 넘으면 자동 발송을 멈추고 관리자에게 메일로 알린다(Resend는 4%를 넘으면 발송을 일시 정지할 수 있음).
 * - 사이트 접속 응답 뒤 10분에 한 번 실행(첫 화면을 막지 않음). 한 번에 캠페인 하나, 최대 300통.
 * 또 반송 정리: Resend 발송 목록에서 반송된 메일을 찾아 발송 제외 목록·mail_log.bounced_at에 넣는다(이어서 조금씩, 끝나면 멈춤).
 */

const BOUNCE_LIMIT = 0.03; // 2026-11-11 사용자 지시 2% → 3%(잘 받던 주소 재발송도 반송 1.9~2.0%라 자꾸 멈춤)
const CYCLE_START = Date.parse("2026-10-23T04:32:00Z");
const kstHour = () => new Date(Date.now() + 9 * 3600_000).getUTCHours();
const readKey = () => process.env.RESEND_READ_KEY || "";
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);

async function getSetting(key: string): Promise<string | null> {
  const r = await db()`select value from settings where key = ${key}`;
  return r.length ? String(r[0].value) : null;
}
async function setSetting(key: string, value: string) {
  await db()`insert into settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value`;
}

/** 최근 3일(멈춤을 푼 뒤부터) 대량 메일 반송률. 보낸 수가 300통보다 적으면 판단하지 않는다(null). */
export async function recentBounceRate(): Promise<{ sent: number; bounced: number; rate: number | null }> {
  // 관리자가 멈춤을 풀었으면 그 뒤에 보낸 것만 센다(지난 반송으로 바로 다시 멈추지 않게)
  const resumed = await getSetting("mail_auto_resumed_at");
  const since = new Date(Math.max(Date.now() - 3 * 86_400_000, resumed ? Number(resumed) : 0)).toISOString();
  const r = await db()`select count(*)::int as sent, count(bounced_at)::int as bounced from mail_log
    where kind = 'campaign' and status = 'sent' and created_at > ${since}`;
  const sent = Number(r[0]?.sent ?? 0);
  const bounced = Number(r[0]?.bounced ?? 0);
  return { sent, bounced, rate: sent >= 300 ? bounced / sent : null };
}

export type AutoState = { paused: boolean; reason: string; backfill: { done: boolean; found: number } };
export async function autoState(): Promise<AutoState> {
  const p = await getSetting("mail_auto_paused");
  const b = JSON.parse((await getSetting("bounce_backfill")) ?? "{}") as { done?: boolean; found?: number };
  return { paused: !!p, reason: p ?? "", backfill: { done: !!b.done, found: Number(b.found ?? 0) } };
}
export async function resumeAuto() {
  await db()`delete from settings where key = 'mail_auto_paused'`;
  await setSetting("mail_auto_resumed_at", String(Date.now()));
}

/** Resend 목록에서 반송된 메일을 찾아 제외 목록에 넣는다. 한 번에 최대 pages쪽(100통씩), 이어 읽을 자리는 settings에 둔다. */
export async function bounceBackfill(pages = 12): Promise<{ done: boolean; found: number }> {
  const state = JSON.parse((await getSetting("bounce_backfill")) ?? "{}") as { after?: string; done?: boolean; found?: number };
  if (state.done || !readKey()) return { done: !!state.done, found: Number(state.found ?? 0) };
  let after = state.after ?? "";
  let found = Number(state.found ?? 0);
  let done = false;
  for (let i = 0; i < pages; i++) {
    const res = await fetch(`https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ""}`, {
      headers: { Authorization: `Bearer ${readKey()}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!res || !res.ok) break;
    const j = (await res.json().catch(() => ({}))) as { data?: { id: string; to?: string[] | string; created_at: string; last_event?: string }[]; has_more?: boolean };
    const list = j.data ?? [];
    const bounced = list.filter((e) => e.last_event === "bounced");
    for (const e of bounced) {
      const to = Array.isArray(e.to) ? e.to : e.to ? [e.to] : [];
      for (const a of to) await suppress(String(a), "bounce");
    }
    if (bounced.length) {
      await db()`update mail_log set bounced_at = coalesce(bounced_at, now()) where provider_id = any(${bounced.map((e) => e.id)}::text[])`;
      found += bounced.length;
    }
    const oldest = list[list.length - 1];
    if (!oldest || !j.has_more || Date.parse(oldest.created_at.replace(" ", "T").replace(/\+00$/, "Z")) < CYCLE_START) {
      done = true;
      break;
    }
    after = oldest.id;
  }
  await setSetting("bounce_backfill", JSON.stringify({ after, done, found }));
  return { done, found };
}

async function pause(reason: string) {
  await setSetting("mail_auto_paused", reason);
  for (const to of adminEmails()) {
    await deliver({
      kind: "mail-auto-paused", category: "transactional", to,
      subject: "[모두의카풀 관리자] 대량 메일 자동 발송을 멈췄어요",
      html: `<p>${reason}</p><p>관리자 › 발송 화면에서 원인을 확인하고 [자동 발송 다시 켜기]를 눌러 주세요.</p>`,
      text: `${reason}\n\n관리자 › 발송 화면에서 원인을 확인하고 [자동 발송 다시 켜기]를 눌러 주세요.`,
    }).catch(() => false);
  }
}

let lastTry = 0;
/** GET /api/posts 응답 뒤에 부른다. 10분에 한 번(인스턴스 + DB 기록으로 겹치지 않게). */
export async function maybeRunAutoMail() {
  if (Date.now() - lastTry < 120_000) return;
  lastTry = Date.now();
  const h = kstHour();
  if (h < 9 || h >= 20) return;
  const sql = db();
  const claim = await sql`insert into settings (key, value) values ('mail_auto_at', ${String(Date.now())})
    on conflict (key) do update set value = excluded.value
    where settings.value::bigint < ${Date.now() - 600_000} returning value`;
  if (!claim.length) return;

  // 1) 반송 정리를 먼저(끝날 때까지 실행마다 조금씩)
  await bounceBackfill(12).catch((e) => console.error("[mail-auto] backfill", e));

  // 2) 멈춤 상태면 아무것도 안 보냄
  if (await getSetting("mail_auto_paused")) return;
  const br = await recentBounceRate();
  if (br.rate !== null && br.rate > BOUNCE_LIMIT) {
    await pause(`최근 3일 대량 메일 반송률이 ${(br.rate * 100).toFixed(1)}%(보낸 ${br.sent}통 중 반송 ${br.bounced}통)로 기준 3%를 넘었어요. Resend가 발송을 멈출 수 있어 자동 발송을 멈췄어요.`);
    return;
  }

  // 3) 자동을 켠 발송 중 캠페인 하나(마지막 실행이 오래된 것부터)
  const next = await sql`select c.id, c.title from mail_campaigns c
    where c.auto and c.status = 'sending'
    order by (select max(r.created_at) from mail_runs r where r.campaign_id = c.id) asc nulls first, c.created_at limit 1`;
  if (!next.length) return;
  const t0 = Date.now();
  const r = await runCampaignBatch(String(next[0].id), 300);
  if (r.ok) {
    await sql`insert into mail_runs (source, campaign_id, campaign_title, sent, held, done, ms, note)
      values ('auto', ${next[0].id}, ${String(next[0].title)}, ${r.sent}, ${r.held}, ${r.done}, ${Date.now() - t0}, '자동 이어 보내기(안전장치)')`;
    // 묶음(300통)을 보낼 때마다 관리자 주소에도 같은 메일을 한 통씩 보낸다(실제로 나가는지·모양 확인, 2026-11-11 사용자 지시)
    if (r.sent > 0) await adminCopy(String(next[0].id), r.sent).catch((e) => console.error("[mail-auto] admin copy", e));
  }
}

async function adminCopy(id: string, sent: number) {
  const to = adminEmails();
  if (!to.length) return;
  const sql = db();
  const c = (await sql`select subject, body, (select count(*) from mail_log l where l.campaign_id = c.id and l.status = 'sent')::int as total,
      (select count(*) from mail_log l where l.campaign_id = c.id and l.bounced_at is not null)::int as bounced
    from mail_campaigns c where id = ${id}`)[0];
  if (!c) return;
  const head = `[발송 확인] 이번 ${sent}통 · 누적 ${c.total}통 · 반송 ${c.bounced}통`;
  const html = `<p style="margin:0 auto 12px;max-width:480px;padding:10px 12px;border-radius:10px;background:#FFF4EC;color:#C2410C;font-size:13px;font-family:sans-serif">${head} — 회원에게는 아래 카드만 갑니다(호칭은 예시 코드).</p>` + personalize(renderHtml(String(c.body)), "1234567A");
  const text = `${head}\n\n` + personalize(`${String(c.body).replace(/\{\{img:[^}]+\}\}/g, "[이미지]")}\n\n${RETENTION_TEXT}`, "1234567A");
  for (const addr of to) {
    await deliver({ kind: "campaign-admin-copy", category: "transactional", to: addr, subject: `${head} | ${personalize(String(c.subject), "1234567A")}`, html, text }).catch(() => false);
  }
}
