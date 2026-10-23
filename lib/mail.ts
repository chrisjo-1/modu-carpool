import { db, ensureSchema } from "./server";
import { SITE_URL as SITE } from "./site";
import { suppressedNow, unsubUrl } from "./unsub";

/**
 * 메일 발송 공통 경로. 모든 메일은 deliver()를 거쳐 나가고, 결과(발송·실패·차단·테스트)가 mail_log에 남는다.
 * RESEND_API_KEY 와 MAIL_FROM(예: "모두의카풀 <noreply@내도메인>")이 있어야 실제로 나간다.
 * 알림이 실패해도 본래 동작(신청·대화)은 그대로 성공해야 하므로 오류는 기록만 한다.
 */
export const mailEnabled = () => (!!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM) || process.env.MAIL_DRYRUN === "1";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** 구분: transactional = 계정·거래 안내(항상 발송), marketing = 광고성·홍보성(정책 적용) */
export type MailCategory = "transactional" | "marketing";

/** 메일 정책. 관리자 메일 탭에서 바꾼다. 하루 한도는 대량(캠페인) 메일 전체에, 나머지는 광고성 메일에만 적용한다. */
export type MailPolicy = { dailyCap: number; monthlyCap: number; cycleDay: number; quietOn: boolean; quietFrom: number; quietTo: number; marketingOn: boolean; requireConsent: boolean };
export const DEFAULT_POLICY: MailPolicy = { dailyCap: 0, monthlyCap: 50000, cycleDay: 23, quietOn: true, quietFrom: 21, quietTo: 8, marketingOn: false, requireConsent: true };

export async function getPolicy(): Promise<MailPolicy> {
  await ensureSchema();
  const r = await db()`select daily_cap, monthly_cap, cycle_day, quiet_on, quiet_from, quiet_to, marketing_on, require_consent from mail_policy where id = 1`;
  if (!r.length) return DEFAULT_POLICY;
  const x = r[0];
  return {
    dailyCap: Number(x.daily_cap),
    monthlyCap: Number(x.monthly_cap),
    cycleDay: Number(x.cycle_day),
    quietOn: x.quiet_on === true,
    quietFrom: Number(x.quiet_from),
    quietTo: Number(x.quiet_to),
    marketingOn: x.marketing_on === true,
    requireConsent: x.require_consent === true,
  };
}

/** 한국 시간 기준 현재 시각(0~23) */
const kstHour = () => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Seoul" }).format(new Date())) % 24;

/** 야간 발송 제한 시간인지. 예: 21시~8시는 21시 이상이거나 8시 미만이면 제한 */
export const inQuietHours = (p: MailPolicy, h = kstHour()) =>
  p.quietOn && (p.quietFrom > p.quietTo ? h >= p.quietFrom || h < p.quietTo : h >= p.quietFrom && h < p.quietTo);

export type Mail = {
  kind: string;
  category: MailCategory;
  to: string;
  userId?: string | null;
  subject: string;
  html: string;
  text: string;
  /** 캠페인 발송이면 캠페인 id (이력과 진행률 집계에 쓴다) */
  campaignId?: string | null;
  /** 관리자 테스트 발송: 정책·수신 확인을 건너뛰고 광고성 머리말·수신거부 문구만 붙인다 */
  testOnly?: boolean;
};

/** 발송 결과. halt 계열(off·quiet·cap)은 보류라서 이력에 남기지 않고, 다음 발송 때 다시 대상이 된다. */
export type Status = "sent" | "failed" | "blocked" | "dryrun" | "disabled" | "off" | "quiet" | "cap" | "quota";

async function record(m: Mail, status: string, error = "", providerId = "") {
  try {
    await db()`insert into mail_log (kind, category, to_email, user_id, subject, status, error, provider_id, campaign_id)
      values (${m.kind}, ${m.category}, ${m.to}, ${m.userId ?? null}, ${m.subject.slice(0, 200)}, ${status}, ${error.slice(0, 300)}, ${providerId.slice(0, 100)}, ${m.campaignId ?? null})`;
  } catch (e) {
    console.error("[mail-log]", e);
  }
}

/** 광고성 메일을 막을 이유. log: 이력에 '차단'으로 남김, 나머지는 보류(이력 없음). */
async function blockCheck(m: Mail): Promise<{ code: "log" | "off" | "quiet" | "cap"; reason: string } | null> {
  const p = await getPolicy();
  if (!p.marketingOn) return { code: "off", reason: "광고성 메일 발송이 꺼져 있음" };
  if (inQuietHours(p)) return { code: "quiet", reason: `야간 발송 제한 시간(${p.quietFrom}시~${p.quietTo}시)` };
  if (!process.env.SESSION_SECRET) return { code: "log", reason: "수신거부 링크를 만들 수 없음(SESSION_SECRET 없음)" };
  const sup = await suppressedNow(m.to);
  if (sup) return { code: "log", reason: sup };
  if (p.requireConsent) {
    if (!m.userId) return { code: "log", reason: "수신 동의 확인 불가(가입 회원이 아님)" };
    const u = await db()`select marketing from users where id = ${m.userId}`;
    if (u[0]?.marketing !== true) return { code: "log", reason: "광고성 메일 수신 동의 없음" };
  }
  return null;
}

/**
 * 오늘(한국 시각) 나간 대량(캠페인) 메일 수. 하루 한도는 캠페인 메일에만 걸고,
 * 탈퇴 확인·이메일 인증·비밀번호 재설정 같은 꼭 필요한 메일은 막지 않는다.
 */
export async function campaignSentToday(): Promise<number> {
  const n = await db()`select count(*)::int as n from mail_log
    where campaign_id is not null and status = 'sent' and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')`;
  return Number(n[0].n);
}

const DAY = 86_400_000;

/** 오늘(KST) 대량 메일 발송 몫. 하루 한도를 정했으면 그 값, 0이면 월 한도에 맞춰 자동으로 나눈다. */
export type Allowance = { auto: boolean; cap: number; left: number; sentToday: number; monthSent: number; monthlyCap: number; daysLeft: number; cycleStart: number; cycleEnd: number };

/**
 * 자동(하루 한도 0): (월 한도 − 이번 결제 주기에 이미 보낸 전체 메일(오늘 전까지) − 꼭 필요한 메일 몫) ÷ 남은 날수(오늘 포함).
 * 꼭 필요한 메일 몫은 월 한도의 10%를 남은 날수 비율로 남긴다. 어제 덜 보냈으면 오늘 몫이 늘어난다.
 * 수동 한도도 월 한도 남은 양을 넘지 않는다.
 */
export async function campaignAllowance(p?: MailPolicy): Promise<Allowance> {
  const pol = p ?? (await getPolicy());
  const k = new Date(Date.now() + 9 * 3600_000);
  const y = k.getUTCFullYear(), mo = k.getUTCMonth(), d = k.getUTCDate();
  const dayIn = (yy: number, mm: number) => Math.min(pol.cycleDay, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate());
  let sy = y, sm = mo;
  if (d < dayIn(y, mo)) { sm -= 1; if (sm < 0) { sm = 11; sy -= 1; } }
  const kst = (yy: number, mm: number, dd: number) => Date.UTC(yy, mm, dd) - 9 * 3600_000;
  const cycleStart = kst(sy, sm, dayIn(sy, sm));
  const ny = sm === 11 ? sy + 1 : sy, nm = (sm + 1) % 12;
  const cycleEnd = kst(ny, nm, dayIn(ny, nm));
  const todayStart = kst(y, mo, d);
  const daysLeft = Math.max(1, Math.round((cycleEnd - todayStart) / DAY));
  const cycleLen = Math.max(1, Math.round((cycleEnd - cycleStart) / DAY));
  const r = await db()`select count(*) filter (where created_at < ${new Date(todayStart).toISOString()})::int as before,
      count(*)::int as total,
      count(*) filter (where campaign_id is not null and created_at >= ${new Date(todayStart).toISOString()})::int as today
    from mail_log where status = 'sent' and created_at >= ${new Date(cycleStart).toISOString()}`;
  const before = Number(r[0].before), monthSent = Number(r[0].total), sentToday = Number(r[0].today);
  const monthLeft = Math.max(0, pol.monthlyCap - monthSent);
  let cap: number;
  if (pol.dailyCap > 0) cap = pol.dailyCap;
  else {
    const reserve = Math.round(pol.monthlyCap * 0.1 * daysLeft / cycleLen);
    cap = Math.max(0, Math.floor((pol.monthlyCap - before - reserve) / daysLeft));
  }
  const left = Math.max(0, Math.min(cap - sentToday, monthLeft));
  return { auto: pol.dailyCap <= 0, cap, left, sentToday, monthSent, monthlyCap: pol.monthlyCap, daysLeft, cycleStart, cycleEnd };
}

type Prepared = { held: Status } | { payload: { from: string; to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> } };

/** 정책 확인(광고성)과 본문 꾸미기. 차단은 여기서 이력을 남기고, 보류는 이력 없이 돌려준다. */
async function prepare(m: Mail): Promise<Prepared> {
  if (m.category === "marketing" && !m.testOnly) {
    const b = await blockCheck(m);
    if (b) {
      if (b.code === "log") {
        console.log(`[mail] blocked ${m.kind} to=${m.to}: ${b.reason}`);
        await record(m, "blocked", b.reason);
        return { held: "blocked" };
      }
      console.log(`[mail] held ${m.kind} (${b.code}): ${b.reason}`);
      return { held: b.code };
    }
  }
  // 광고성 메일에는 수신거부 링크와 원클릭 수신거부 헤더를 붙인다(테스트 발송도 같은 모양으로 보인다).
  const url = m.category === "marketing" ? unsubUrl(m.to) : "";
  // 모든 메일에 서비스 주소와 바로가기 버튼을 넣는다.
  const linked = ensureSiteLink(m.html, m.text);
  const html = m.category === "marketing"
    ? `${linked.html}<div style="max-width:480px;margin:0 auto;padding:12px 4px;font-size:12px;line-height:1.6;color:#8B95A1;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif">광고성 메일을 원하지 않으시면 <a href="${url}" style="color:#8B95A1">수신거부</a>를 눌러 주세요. 웹에서도 <a href="${SITE}/unsubscribe" style="color:#8B95A1">${SITE_HOST}/unsubscribe</a>에서 거부할 수 있어요.</div>`
    : linked.html;
  const text = m.category === "marketing" ? `${linked.text}\n\n수신거부: ${url}\n웹 수신거부: ${SITE}/unsubscribe` : linked.text;
  return {
    payload: {
      from: String(process.env.MAIL_FROM ?? ""), to: [m.to], subject: m.subject, html, text,
      ...(url ? { headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    },
  };
}

/**
 * 캠페인 메일 여러 통을 Resend 묶음 발송(한 번에 최대 100통)으로 보낸다. 하루 한도는 호출하는 쪽(runCampaignBatch)이 맞춘다.
 * 보류(꺼짐·야간)를 만나면 그 자리에서 멈추고, Resend 한도(429)면 이력 없이 quota로 멈춘다(다음에 다시 대상).
 */
/**
 * Resend 일괄 발송은 요청을 200으로 받아 둔 뒤 한도 초과 등으로 나중에 '실패' 처리할 수 있다.
 * 그래서 Resend의 최근 발송 목록을 읽어, 우리 기록에 '발송됨'인데 Resend에서 실패한 메일을
 * 'failed'(429 …)로 바꾼다 → 캠페인 대상에 다시 들어가 다음 발송 때 다시 보낸다.
 * 3분에 한 번만(관리자 메일 화면·발송·예약 실행이 부른다). 지난번 확인 시각 15분 전까지 거슬러 본다.
 */
export async function reconcileFailed(force = false): Promise<number> {
  if (!process.env.RESEND_API_KEY) return 0;
  try {
    const sql = db();
    const now = Date.now();
    const r = await sql`select value from settings where key = 'mail_reconcile_at'`;
    const last = r[0] ? Date.parse(String(r[0].value)) : NaN;
    if (!force && Number.isFinite(last) && now - last < 180_000) return 0;
    await sql`insert into settings (key, value) values ('mail_reconcile_at', ${new Date(now).toISOString()})
      on conflict (key) do update set value = excluded.value`;
    const since = Number.isFinite(last) ? last - 15 * 60_000 : now - 3 * 86_400_000;
    const failed: string[] = [];
    let after = "";
    for (let page = 0; page < 60; page++) {
      const res = await fetch(`https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ""}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;
      const j = (await res.json().catch(() => ({}))) as { data?: { id: string; created_at: string; last_event?: string }[]; has_more?: boolean };
      const list = j.data ?? [];
      for (const e of list) if (e.last_event === "failed") failed.push(e.id);
      const oldest = list[list.length - 1];
      if (!oldest || !j.has_more || Date.parse(oldest.created_at.replace(" ", "T").replace(/\+00$/, "Z")) < since) break;
      after = oldest.id;
    }
    if (!failed.length) return 0;
    const u = await sql`update mail_log set status = 'failed', error = '429 Resend 발송 실패(한도 초과 등) — 다시 보낼 대상'
      where status = 'sent' and provider_id = any(${failed}) returning 1`;
    if (u.length) console.log(`[mail] reconcile: Resend 실패 ${u.length}건을 다시 보낼 대상으로 돌림`);
    return u.length;
  } catch (e) {
    console.error("[mail reconcile]", e);
    return 0;
  }
}

/** 한 통을 보통 발송으로 보내 본다. 한도에 막혀 있으면 429를 바로 알 수 있다(일괄 발송은 200을 주고 나중에 실패시키므로). */
async function sendOne(payload: unknown): Promise<{ ok: boolean; status: number; id: string; err: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  return { ok: res.ok, status: res.status, id: String(j.id ?? ""), err: `${res.status} ${j.message ?? ""}`.trim() };
}

export async function deliverCampaignBatch(ms: Mail[]): Promise<{ sent: number; held: Status | null }> {
  let sent = 0;
  const ready: { m: Mail; payload: Extract<Prepared, { payload: unknown }>["payload"] }[] = [];
  for (const m of ms) {
    const p = await prepare(m).catch(async (e) => {
      console.error("[mail]", e);
      await record(m, "failed", String(e));
      return { held: "failed" as Status };
    });
    if ("held" in p) {
      if (p.held === "blocked" || p.held === "failed") continue;
      if (ready.length === 0) return { sent, held: p.held };
      break;
    }
    ready.push({ m, payload: p.payload });
  }
  if (process.env.MAIL_DRYRUN === "1") {
    for (const r of ready) await record(r.m, "dryrun");
    return { sent: 0, held: null };
  }
  if (!mailEnabled()) {
    for (const r of ready) await record(r.m, "disabled", "RESEND_API_KEY 또는 MAIL_FROM 없음");
    return { sent: 0, held: null };
  }
  // 첫 통은 보통 발송으로 보내 한도 상태를 먼저 확인한다. 막혀 있으면 아무것도 기록하지 않고 멈춘다.
  if (ready.length) {
    try {
      const first = await sendOne(ready[0].payload);
      if (first.status === 429) {
        console.error("[mail batch] probe 429", first.err);
        return { sent, held: "quota" };
      }
      if (first.ok) {
        await record(ready[0].m, "sent", "", first.id);
        sent += 1;
      } else await record(ready[0].m, "failed", first.err);
    } catch (e) {
      await record(ready[0].m, "failed", String(e));
    }
    ready.shift();
  }
  for (let i = 0; i < ready.length; i += 100) {
    const chunk = ready.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((c) => c.payload)),
        signal: AbortSignal.timeout(20000),
      });
      const j = (await res.json().catch(() => ({}))) as { data?: { id?: string }[]; message?: string };
      if (!res.ok) {
        const err = `${res.status} ${j.message ?? ""}`.trim();
        console.error("[mail batch]", err);
        if (res.status === 429) return { sent, held: "quota" };
        for (const c of chunk) await record(c.m, "failed", err);
        continue;
      }
      await Promise.all(chunk.map((c, k) => record(c.m, "sent", "", String(j.data?.[k]?.id ?? ""))));
      sent += chunk.length;
    } catch (e) {
      console.error("[mail batch]", e);
      for (const c of chunk) await record(c.m, "failed", String(e));
    }
  }
  return { sent, held: null };
}

/** 메일을 보내고 결과를 돌려준다. 이력은 보류가 아닌 경우에만 남긴다. */
/** 메일 안에 서비스 주소·바로가기 버튼이 이미 있다는 표시. 없으면 발송할 때 자동으로 붙인다. */
export const SITE_MARK = "<!--site-link-->";
const SITE_HOST = SITE.replace(/^https?:\/\//, "");
const FONT = "-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif";

/**
 * 서비스 주소와 "모두의카풀 바로가기" 버튼. 모든 메일에 반드시 들어간다.
 * outline: 이미 파란 행동 버튼(인증하기 등)이 있는 메일에서는 테두리 버튼으로 겹쳐 보이지 않게 한다.
 */
export function siteLinkBlock(outline = false): string {
  const btn = outline
    ? "background:#ffffff;color:#2F6BFF;border:1px solid #2F6BFF"
    : "background:#2F6BFF;color:#ffffff;border:1px solid #2F6BFF";
  return `${SITE_MARK}<div style="text-align:center;padding:8px 0 0">
<a href="${SITE}" style="display:inline-block;${btn};text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px;font-family:${FONT}">모두의카풀 바로가기</a>
<p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#4E5968;font-family:${FONT}">서비스 주소: <a href="${SITE}" style="color:#2F6BFF;text-decoration:underline">${SITE_HOST}</a></p>
</div>`;
}

/** 주소·바로가기가 빠진 메일에 붙인다(빠뜨리지 않도록 발송 한 곳에서 처리). */
export function ensureSiteLink(html: string, text: string): { html: string; text: string } {
  const outHtml = html.includes(SITE_MARK)
    ? html
    : `${html}<div style="max-width:480px;margin:0 auto;padding:16px 4px 4px">${siteLinkBlock(html.includes("background:#2F6BFF"))}</div>`;
  const outText = text.includes(SITE) ? text : `${text}\n\n모두의카풀 바로가기: ${SITE}`;
  return { html: outHtml, text: outText };
}

export async function deliverWithStatus(m: Mail): Promise<Status> {
  try {
    // 대량(캠페인) 메일은 하루 한도 안에서만 보낸다(꼭 필요한 메일은 한도 없이).
    if (m.campaignId && !m.testOnly) {
      const al = await campaignAllowance();
      if (al.left <= 0) {
        console.log(`[mail] held campaign (cap): 오늘 대량 발송 몫(${al.cap}통) 소진`);
        return "cap";
      }
    }
    const prep = await prepare(m);
    if ("held" in prep) return prep.held;
    if (process.env.MAIL_DRYRUN === "1") {
      console.log(`[mail] to=${m.to} | ${m.subject}`);
      await record(m, "dryrun", m.testOnly ? "테스트 발송" : "");
      return "dryrun";
    }
    if (!mailEnabled()) {
      await record(m, "disabled", "RESEND_API_KEY 또는 MAIL_FROM 없음");
      return "disabled";
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(prep.payload),
      signal: AbortSignal.timeout(6000),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      const err = `${res.status} ${j.message ?? ""}`.trim();
      console.error("[mail]", err);
      // 캠페인 발송 중 Resend 한도(429)에 걸리면 이력을 남기지 않고 멈춘다 → 다음 발송 때 다시 대상이 된다
      if (res.status === 429 && m.campaignId) return "quota";
      await record(m, "failed", err);
      return "failed";
    }
    await record(m, "sent", "", String(j.id ?? ""));
    return "sent";
  } catch (e) {
    console.error("[mail]", e);
    await record(m, "failed", String(e));
    return "failed";
  }
}

/** 기존 호출부용: 보냈거나(테스트 포함) 보류·차단이 아니면 true */
export async function deliver(m: Mail): Promise<boolean> {
  const s = await deliverWithStatus(m);
  return s === "sent" || s === "dryrun";
}

export const siteUrl = () => SITE;

type Kind = "request" | "accepted" | "hello";
const copy: Record<Kind, (from: string, route: string) => { subject: string; lead: string; button: string }> = {
  request: (from, route) => ({ subject: `[모두의카풀] ${from} 님이 카풀을 신청했어요`, lead: `${from} 님이 "${route}" 카풀을 신청했습니다. 신청을 확인하고 수락하거나 거절해 주세요.`, button: "신청 확인하기" }),
  accepted: (from, route) => ({ subject: `[모두의카풀] ${from} 님이 카풀 신청을 수락했어요`, lead: `${from} 님이 "${route}" 카풀 신청을 수락했습니다. 이제 채팅으로 만날 곳과 시간을 정해 보세요.`, button: "대화하러 가기" }),
  hello: (from, route) => ({ subject: `[모두의카풀] ${from} 님이 첫 메시지를 보냈어요`, lead: `${from} 님이 "${route}" 카풀 채팅에서 첫 메시지를 보냈습니다.`, button: "메시지 확인하기" }),
};

/** 비밀번호 재설정 메일. 알림 수신 설정과 관계없이 보낸다. */
export async function sendResetMail(to: string, link: string) {
  const subject = "[모두의카풀] 비밀번호 재설정 안내";
  const lead = "비밀번호 재설정을 요청하셨습니다. 아래 버튼을 눌러 30분 안에 새 비밀번호를 정해 주세요.";
  const note = "요청하지 않으셨다면 이 메일을 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.";
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">새 비밀번호 정하기</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">${note}</p>
</div></div>`;
  return deliver({ kind: "reset", category: "transactional", to, subject, html, text: `${lead}\n\n${link}\n\n${note}` });
}

/** 가입 메일 인증. 알림 수신 설정과 관계없이 보낸다. */
export async function sendVerifyMail(to: string, link: string) {
  const subject = "[모두의카풀] 이메일 인증을 완료해 주세요";
  const lead = "모두의카풀에 가입해 주셔서 고마워요. 아래 버튼을 눌러 이메일 인증을 마치면 카풀 글쓰기와 신청을 할 수 있어요.";
  const note = "링크는 24시간 동안 쓸 수 있어요. 직접 가입하지 않으셨다면 이 메일을 무시해 주세요.";
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">이메일 인증하기</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">${note}</p>
</div></div>`;
  return deliver({ kind: "verify", category: "transactional", to, subject, html, text: `${lead}\n\n${link}\n\n${note}` });
}

/** 워프 이메일 확인 링크. 가입 이메일과 다른 워프 이메일로 확인할 때, 그 주소로 보낸다. */
export async function sendLegacyConfirmMail(to: string, link: string) {
  const subject = "[모두의카풀] 워프 기존 회원 확인";
  const lead = "모두의카풀 가입 때 이 메일 주소를 워프 회원 확인에 쓰셨어요. 본인이 맞다면 아래 버튼을 눌러 확인해 주세요. 확인하면 이전 축하 크레딧을 드려요.";
  const note = "본인이 요청하지 않았다면 이 메일을 무시해 주세요. 링크는 72시간 동안 쓸 수 있어요.";
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">워프 회원 확인하기</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">${note}</p>
</div></div>`;
  return deliver({ kind: "legacy-confirm", category: "transactional", to, subject, html, text: `${lead}\n\n${link}\n\n${note}` });
}

/** 메일로 알리기: 읽지 않은 메시지 수와 마지막 메시지를 보낸다. 받는 사람이 알림을 껐으면 보내지 않는다. */
export async function nudgeMail(toUserId: string, fromName: string, route: string, count: number, last: string, path: string) {
  const rows = await db()`select email from users where id = ${toUserId} and notify and not test and not blocked`;
  if (!rows.length) return false;
  const to = String(rows[0].email);
  const from = fromName || "회원";
  const subject = `[모두의카풀] ${from} 님의 메시지 ${count}개를 아직 확인하지 않으셨어요`;
  const lead = `"${route}" 카풀 채팅에서 ${from} 님이 메시지를 기다리고 있어요.`;
  const link = `${SITE}${path}`;
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(lead)}</p>
<p style="margin:0 0 16px;padding:12px 14px;background:#F5F7FA;border-radius:12px;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(last)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">메시지 확인하기</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">상대 회원이 보낸 알림 요청입니다. 받고 싶지 않으면 내 정보에서 "메일 알림"을 꺼 주세요.</p>
</div></div>`;
  return deliver({ kind: "nudge", category: "transactional", to, userId: toUserId, subject, html, text: `${lead}\n\n"${last}"\n\n${link}` });
}

export async function notify(toUserId: string, kind: Kind, fromName: string, route: string, quote = "") {
  try {
    const rows = await db()`select email, name from users where id = ${toUserId} and notify and not test and not blocked`;
    if (!rows.length) return;
    const to = String(rows[0].email);
    const c = copy[kind](fromName || "회원", route);
    const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(c.lead)}</p>
${quote ? `<p style="margin:0 0 16px;padding:12px 14px;background:#F5F7FA;border-radius:12px;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(quote)}</p>` : ""}
<a href="${SITE}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">${c.button}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">이 메일은 모두의카풀 가입 메일로 보내는 알림입니다. 받고 싶지 않으면 내 정보에서 "메일 알림"을 꺼 주세요.</p>
</div></div>`;
    await deliver({ kind: `notify-${kind}`, category: "transactional", to, userId: toUserId, subject: c.subject, html, text: `${c.lead}\n${quote ? `\n"${quote}"\n` : ""}\n${SITE}` });
  } catch (e) {
    console.error("[mail]", e);
  }
}

/** 탈퇴 확인 링크. 탈퇴 여부 확인 창에서 탈퇴를 신청했을 때 그 메일 주소로 보낸다. */
/**
 * 탈퇴 신청 확인 메일. 버튼은 두 가지: 탈퇴 확인하기(파랑), 개인정보만 삭제(주황, 계정이 있을 때만).
 * links.purge가 없으면(가입 계정 없이 워프 행만 있는 경우) 탈퇴 버튼만 보낸다.
 */
export async function sendWithdrawConfirmMail(to: string, links: { withdraw: string; purge?: string }, kind: "withdraw" | "purge" = "withdraw") {
  const subject = "[모두의카풀] 탈퇴 신청 확인";
  const lead = links.purge
    ? "모두의카풀 탈퇴를 신청하셨어요. 본인이 맞다면 아래에서 골라 주세요. 탈퇴 확인하기를 누르면 탈퇴가 끝나고 개인정보는 삭제되며 이메일 주소만 남아요. 계속 이용하고 싶다면 개인정보만 삭제를 누르세요. 계정은 그대로 두고 이름·전화번호·연락처 등만 지워요."
    : "모두의카풀 탈퇴를 신청하셨어요. 본인이 맞다면 아래 버튼을 눌러 탈퇴를 완료해 주세요. 탈퇴하면 개인정보는 삭제되고 이메일 주소만 남아요.";
  const note = "본인이 요청하지 않았다면 이 메일을 무시해 주세요. 링크는 72시간 동안 쓸 수 있어요.";
  const btnBase = "display:inline-block;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 18px;border-radius:12px";
  const buttons = links.purge
    ? `<a href="${esc(links.withdraw)}" style="${btnBase};background:#2F6BFF;margin:0 8px 8px 0">탈퇴 확인하기</a><a href="${esc(links.purge)}" style="${btnBase};background:#E8590C;margin:0 0 8px 0">개인정보만 삭제</a>`
    : `<a href="${esc(links.withdraw)}" style="${btnBase};background:#2F6BFF">탈퇴 확인하기</a>`;
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<div>${buttons}</div>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">${note}</p>
</div></div>`;
  const text = links.purge
    ? `${lead}\n\n탈퇴 확인: ${links.withdraw}\n개인정보만 삭제: ${links.purge}\n\n${note}`
    : `${lead}\n\n${links.withdraw}\n\n${note}`;
  return deliver({ kind, category: "transactional", to, subject, html, text });
}

/** 이용 정지 안내 메일. 운영 정책 위반으로 로그인과 글쓰기가 막혔을 때 보낸다. 알림 수신 설정과 관계없이 보낸다. */
export async function sendSuspendMail(to: string, name: string, reason: string) {
  const subject = "[모두의카풀] 이용이 정지되었어요";
  const why = reason ? `사유: ${reason}` : "운영 정책 위반";
  const lead = `${name || "회원"}님, 모두의카풀 이용이 정지되었습니다. (${why}) 정지 기간에는 로그인과 글쓰기, 신청이 제한됩니다.`;
  const note = "정지에 대해 이의가 있으면 이 메일에 답장하거나 운영자에게 문의해 주세요. 확인 후 조치 결과를 안내드립니다.";
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(lead)}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#8B95A1">${esc(note)}</p>
</div></div>`;
  return deliver({ kind: "suspend", category: "transactional", to, subject, html, text: `${lead}\n\n${note}` });
}
