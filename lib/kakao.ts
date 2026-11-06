import { createHmac, randomBytes } from "crypto";
import { db } from "./server";
import { SITE_URL } from "./site";
import { smsTargets, type SmsGroup } from "./smsTargets";

/**
 * 알림톡 발송(2026-11-06 사용자 지시 "알림톡 발송 시스템을 만들어").
 * 용도는 워프 회원을 모두의카풀로 들어오게 하는 정보성 안내뿐이다(CLAUDE.md 남은 일 '워프 재가입 단계 발송').
 * 업체: 솔라피(SOLAPI) REST v4. 환경변수(Vercel에만): SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID(카카오 채널 연결 ID) 필수,
 *   SOLAPI_SENDER(사전 등록한 발신번호)는 선택 — 있으면 알림톡 실패 때 문자로 대신 보내고, 없으면 알림톡만 보낸다(disableSms).
 *   필수 셋 중 하나라도 없으면 실제 발송은 막고, 시험 발송은 미리보기만 돌려준다.
 * 템플릿: 카카오 승인을 받은 템플릿 ID와 '똑같은' 본문을 관리자 화면에 저장(settings 'kakao_templates').
 *   변수는 #{이름}·#{링크}. 알림톡이 실패하면 솔라피가 같은 내용을 문자(LMS)로 대신 보낸다(disableSms=false).
 * 링크: 회원마다 짧은 주소 /s/<코드>(kakao_links, 14일). 누르면 그때 30분짜리 비밀번호 설정 링크를 만들어 /?reset= 로 보낸다.
 * 발송 작업(settings 'kakao_job'): 그룹을 고르고 시작하면 사이트 접속 응답 뒤 3분마다 100명씩, 오전 9시~오후 8시에만.
 *   한 사람에게 같은 템플릿은 한 번만(kakao_log 고유 색인). 기록에는 전화번호를 남기지 않는다.
 */

export type KakaoTemplate = { key: string; label: string; templateId: string; body: string };
export type KakaoJob = { on: boolean; templateKey: string; groups: SmsGroup[]; warp: "all" | "new" | "old"; cap: number; startedAt?: string; note?: string };

export const DEFAULT_TEMPLATES: KakaoTemplate[] = [
  {
    key: "warp-invite",
    label: "워프 회원 이전 안내",
    templateId: "",
    body:
      "[모두의카풀] #{이름}님, 워프에서 쓰시던 카풀 정보가 모두의카풀에 준비되어 있어요.\n\n" +
      "아래 주소를 누르고 비밀번호만 정하면 바로 이용하실 수 있어요.\n#{링크}\n\n" +
      "※ 워프 회원 이전에 따라 보내 드리는 안내입니다. 더 받지 않거나 개인정보 삭제를 원하시면 moducarpool.com/?leave=1",
  },
];

const HOURLY_CAP = 600;
const PER_RUN = 100;
const kstHour = () => new Date(Date.now() + 9 * 3600_000).getUTCHours();

export function kakaoConfig() {
  const key = process.env.SOLAPI_API_KEY || "";
  const secret = process.env.SOLAPI_API_SECRET || "";
  const sender = (process.env.SOLAPI_SENDER || "").replace(/\D/g, "");
  const pfId = process.env.SOLAPI_PFID || "";
  // 알림톡은 카카오 채널(pfId)로 가서 발신번호가 없어도 된다. 발신번호는 실패했을 때 문자로 대신 보낼 때만 쓴다.
  return { key, secret, sender, pfId, ready: !!(key && secret && pfId), fallback: !!sender, has: { key: !!key, secret: !!secret, sender: !!sender, pfId: !!pfId } };
}

async function getSetting(k: string) {
  const r = await db()`select value from settings where key = ${k}`;
  return r.length ? String(r[0].value) : null;
}
async function setSetting(k: string, v: string) {
  await db()`insert into settings (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value`;
}

export async function getTemplates(): Promise<KakaoTemplate[]> {
  try {
    const t = JSON.parse((await getSetting("kakao_templates")) ?? "null") as KakaoTemplate[] | null;
    return Array.isArray(t) && t.length ? t : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}
export async function saveTemplates(list: KakaoTemplate[]) {
  const clean = list
    .map((t) => ({
      key: String(t.key || "").trim().slice(0, 40).replace(/[^a-z0-9-]/gi, "") || "tpl",
      label: String(t.label || "").trim().slice(0, 60),
      templateId: String(t.templateId || "").trim().slice(0, 80),
      body: String(t.body || "").slice(0, 1000),
    }))
    .slice(0, 10);
  await setSetting("kakao_templates", JSON.stringify(clean));
  return clean;
}
export async function getJob(): Promise<KakaoJob | null> {
  try {
    return JSON.parse((await getSetting("kakao_job")) ?? "null") as KakaoJob | null;
  } catch {
    return null;
  }
}
export async function setJob(j: KakaoJob | null) {
  if (!j) await db()`delete from settings where key = 'kakao_job'`;
  else await setSetting("kakao_job", JSON.stringify(j));
}

export const render = (body: string, vars: Record<string, string>) => body.replace(/#\{([^}]+)\}/g, (m, k) => vars[k] ?? m);

/** 솔라피 인증 머리말: HMAC-SHA256(secret, date + salt) */
function authHeader(key: string, secret: string) {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

type Out = { to: string; templateId: string; vars: Record<string, string>; text: string };
type SendResult = { ok: boolean; error: string; failed: Map<string, string>; groupId: string };

/** 여러 건을 한 번에 보낸다(솔라피 send-many/detail). failed: 받는 번호 → 실패 사유(번호는 이 함수 밖 기록에 남기지 않음). */
async function solapiSend(list: Out[]): Promise<SendResult> {
  const c = kakaoConfig();
  if (!c.ready) return { ok: false, error: "솔라피 설정이 없어요", failed: new Map(), groupId: "" };
  const messages = list.map((m) => ({
    to: m.to,
    ...(c.sender ? { from: c.sender } : {}),
    type: "ATA",
    // 본문은 승인 템플릿 + variables로 채운다(text를 따로 넣지 않음). 실패하면 솔라피가 같은 내용을 문자로 대신 보낸다.
    kakaoOptions: { pfId: c.pfId, templateId: m.templateId, variables: Object.fromEntries(Object.entries(m.vars).map(([k, v]) => [`#{${k}}`, v])), disableSms: !c.sender },
  }));
  const res = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
    method: "POST",
    headers: { Authorization: authHeader(c.key, c.secret), "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ errorMessage: String(e) }) }) as unknown as Response);
  const j = (await res.json().catch(() => ({}))) as {
    errorCode?: string; errorMessage?: string;
    groupInfo?: { _id?: string; groupId?: string };
    failedMessageList?: { to?: string; statusCode?: string; statusMessage?: string }[];
  };
  if (!res.ok) return { ok: false, error: `${res.status} ${j.errorCode ?? ""} ${j.errorMessage ?? ""}`.trim(), failed: new Map(), groupId: "" };
  const failed = new Map<string, string>();
  for (const f of j.failedMessageList ?? []) if (f.to) failed.set(String(f.to), `${f.statusCode ?? ""} ${f.statusMessage ?? ""}`.trim());
  return { ok: true, error: "", failed, groupId: String(j.groupInfo?.groupId ?? j.groupInfo?._id ?? "") };
}

/** 시험 발송(관리자가 적은 번호로, 번호는 저장하지 않음). 설정이 없으면 미리보기만. */
export async function testSend(templateKey: string, to: string) {
  const t = (await getTemplates()).find((x) => x.key === templateKey);
  if (!t) return { ok: false, error: "템플릿을 찾을 수 없어요." };
  const vars = { 이름: "홍길동", 링크: `${SITE_URL}/s/TEST0000` };
  const text = render(t.body, vars);
  const phone = to.replace(/\D/g, "");
  if (!/^01\d{8,9}$/.test(phone)) return { ok: false, error: "휴대폰 번호를 확인해 주세요.", preview: text };
  if (!kakaoConfig().ready) return { ok: false, error: "솔라피 환경변수가 없어 미리보기만 보여 드려요.", preview: text };
  if (!t.templateId) return { ok: false, error: "카카오 승인 템플릿 ID를 먼저 넣어 주세요.", preview: text };
  const r = await solapiSend([{ to: phone, templateId: t.templateId, vars, text }]);
  const fail = r.failed.get(phone);
  return { ok: r.ok && !fail, error: r.error || fail || "", preview: text };
}

/** 회원 계정이 없으면(구워프 등) 워프 명단의 메일로 임시 계정을 만든다 — 워프동기화와 같은 방식. */
async function ensureAccount(warpId: string): Promise<{ userId: string; name: string } | null> {
  const sql = db();
  const l = await sql`select warp_id, email_norm, nickname, name, matched_user, withdrawn from legacy_members where warp_id = ${warpId}`;
  if (!l.length || l[0].withdrawn) return null;
  const name = String(l[0].nickname || l[0].name || "").slice(0, 40);
  if (l[0].matched_user) {
    const u = await sql`select id from users where id = ${l[0].matched_user} and withdrawn_at is null and not blocked`;
    return u.length ? { userId: String(u[0].id), name } : null;
  }
  const email = String(l[0].email_norm ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const ins = await sql`insert into users (email, pw, name, contact, contact_type, member_code, pw_reset_required, email_verified)
    values (${email}, ${`unset:${randomBytes(32).toString("hex")}`}, ${name}, '', '', ${warpId.slice(0, 20)}, true, true)
    on conflict do nothing returning id`;
  const u = ins[0] ?? (await sql`select id from users where lower(email) = ${email} and withdrawn_at is null and not blocked limit 1`)[0];
  if (!u) return null;
  await sql`update legacy_members set matched_user = ${u.id}, match_status = '가입됨', matched_by = '알림톡 안내' where warp_id = ${warpId} and matched_user is null`;
  return { userId: String(u.id), name };
}

async function makeLink(userId: string, warpId: string, templateKey: string) {
  const code = randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);
  await db()`insert into kakao_links (code, user_id, warp_id, template_key, expires_at) values (${code}, ${userId}, ${warpId}, ${templateKey}, now() + interval '14 days')`;
  return `${SITE_URL}/s/${code}`;
}

/** 작업 한 번: 대상에서 아직 안 보낸 사람 최대 PER_RUN명 */
export async function runKakaoJob() {
  const job = await getJob();
  if (!job?.on) return { skipped: "off" };
  const c = kakaoConfig();
  if (!c.ready) return { skipped: "no-config" };
  const h = kstHour();
  if (h < 9 || h >= 20) return { skipped: "quiet" };
  const t = (await getTemplates()).find((x) => x.key === job.templateKey);
  if (!t?.templateId) return { skipped: "no-template" };
  const sql = db();
  const sentTotal = Number((await sql`select count(*)::int as n from kakao_log where template_key = ${t.key} and status = 'sent' and created_at >= ${job.startedAt ?? new Date(0).toISOString()}`)[0].n);
  const lastHour = Number((await sql`select count(*)::int as n from kakao_log where status = 'sent' and created_at > now() - interval '1 hour'`)[0].n);
  const room = Math.min(PER_RUN, HOURLY_CAP - lastHour, job.cap > 0 ? job.cap - sentTotal : PER_RUN);
  if (room <= 0) {
    if (job.cap > 0 && sentTotal >= job.cap) await setJob({ ...job, on: false, note: `목표 ${job.cap}명 발송을 마쳤어요` });
    return { skipped: "room" };
  }
  // 보냈거나 건너뛴 사람, 두 번 실패한 사람은 다시 고르지 않는다
  const done = new Set((await sql`select warp_id from kakao_log where template_key = ${t.key}
      group by warp_id having bool_or(status in ('sent', 'skip')) or count(*) filter (where status = 'failed') >= 2`).map((x) => String(x.warp_id)));
  const pick = (await smsTargets())
    .filter((x) => x.phone && job.groups.includes(x.group) && (job.warp === "all" || (job.warp === "new") === x.newWarp) && !done.has(x.code))
    .sort((a, b) => job.groups.indexOf(a.group) - job.groups.indexOf(b.group))
    .slice(0, room);
  if (!pick.length) {
    await setJob({ ...job, on: false, note: "보낼 대상을 모두 보냈어요" });
    return { done: true };
  }
  const phones = await sql`select warp_id, phone_norm from legacy_members where warp_id = any(${pick.map((x) => x.code)}::text[])`;
  const phoneOf = new Map(phones.map((p) => [String(p.warp_id), String(p.phone_norm ?? "")]));
  const out: (Out & { code: string; userId: string; group: string })[] = [];
  for (const p of pick) {
    const phone = phoneOf.get(p.code) ?? "";
    const acc = /^01\d{8,9}$/.test(phone) ? await ensureAccount(p.code) : null;
    if (!acc) {
      await sql`insert into kakao_log (warp_id, template_key, grp, status, error) values (${p.code}, ${t.key}, ${p.group}, 'skip', ${phone ? "계정을 만들 수 없음(메일 없음·탈퇴 등)" : "번호 없음"})
        on conflict do nothing`;
      continue;
    }
    const vars = { 이름: acc.name || "회원", 링크: await makeLink(acc.userId, p.code, t.key) };
    out.push({ to: phone, templateId: t.templateId, vars, text: render(t.body, vars), code: p.code, userId: acc.userId, group: p.group });
  }
  if (!out.length) return { sent: 0 };
  const r = await solapiSend(out);
  if (!r.ok) {
    await setJob({ ...job, on: false, note: `솔라피 오류로 멈췄어요: ${r.error}` });
    return { error: r.error };
  }
  let sent = 0;
  for (const m of out) {
    const fail = r.failed.get(m.to);
    await sql`insert into kakao_log (warp_id, user_id, template_key, grp, status, error, provider_id)
      values (${m.code}, ${m.userId}, ${t.key}, ${m.group}, ${fail ? "failed" : "sent"}, ${fail ?? ""}, ${r.groupId})
      on conflict do nothing`;
    if (!fail) sent += 1;
  }
  return { sent, failed: out.length - sent };
}

let lastTry = 0;
/** GET /api/posts 응답 뒤. 3분에 한 번(인스턴스 + DB 기록으로 겹치지 않게). */
export async function maybeRunKakaoJob() {
  if (Date.now() - lastTry < 60_000) return;
  lastTry = Date.now();
  const job = await getJob();
  if (!job?.on) return;
  const claim = await db()`insert into settings (key, value) values ('kakao_job_at', ${String(Date.now())})
    on conflict (key) do update set value = excluded.value
    where settings.value::bigint < ${Date.now() - 180_000} returning value`;
  if (claim.length) await runKakaoJob();
}

export async function kakaoStats() {
  const r = await db()`select template_key, grp, status, count(*)::int as n from kakao_log group by 1, 2, 3`;
  const links = await db()`select count(*)::int as made, count(k.clicked_at)::int as clicked,
      count(distinct k.user_id) filter (where k.clicked_at is not null and not u.pw_reset_required)::int as pw
    from kakao_links k left join users u on u.id = k.user_id`;
  return { rows: r.map((x) => ({ template: String(x.template_key), group: String(x.grp), status: String(x.status), n: Number(x.n) })), links: links[0] };
}
