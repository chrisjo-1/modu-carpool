import { SMS_GROUP_LABEL, smsSummary, smsTargets, type SmsGroup } from "@/lib/smsTargets";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";
import { ensureAccount, makeLink } from "@/lib/kakao";
import { CREDIT_INVITE_KEY, creditInviteText } from "@/lib/creditInvite";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CSV 한 칸(수식으로 해석될 글자는 앞에 작은따옴표) */
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const kst = (t: string | null) => (t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "");

/**
 * 관리자 메일 탭 '문자·알림톡 대상'(lib/smsTargets.ts).
 * GET → 그룹별 인원. GET ?csv=all|apple|bad|filtered|unread|none → 명단 CSV(전화번호는 넣지 않고 있음 O/X만).
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const want = new URL(req.url).searchParams.get("csv");
    if (want === "links") return linksCsv();
    const list = await smsTargets();
    if (!want) return json({ groups: smsSummary(list), at: Date.now(), links: await linkCount() });
    const rows = want === "all" ? list : list.filter((x) => x.group === want);
    const header = ["그룹", "구분", "고유번호", "이메일", "전화번호 있음", "임시 계정", "마지막 메일(한국시간)"];
    const lines = rows
      .sort((a, b) => Number(b.phone) - Number(a.phone) || Number(b.newWarp) - Number(a.newWarp))
      .map((x) => [SMS_GROUP_LABEL[x.group as SmsGroup], x.newWarp ? "신워프" : "구워프", x.code, x.email, x.phone ? "O" : "X", x.account ? "O" : "X", kst(x.lastMail)]);
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replaceAll("-", "");
    const csv = "﻿" + [header, ...lines].map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sms-targets-${want}-${today}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replaceAll("-", "");

async function linkCount() {
  const r = await db()`select count(*)::int as n, count(clicked_at)::int as clicked from kakao_links where template_key = ${CREDIT_INVITE_KEY} and expires_at > now()`;
  return { total: Number(r[0]?.n ?? 0), clicked: Number(r[0]?.clicked ?? 0) };
}

/** 만들어 둔 크레딧 이관 안내 링크 전체(아직 안 끝난 것). 전화번호는 넣지 않고 있음(O/X)만. */
async function linksCsv() {
  const rows = await db()`
    select k.warp_id, k.code, k.expires_at, k.clicks, l.email_norm, l.src_no like '신워프%' as nw,
      coalesce(l.phone_norm, '') ~ '^01[0-9]{8,9}$' as has_phone, coalesce(l.nickname, l.name, '') as nm,
      exists (select 1 from feedback f where f.user_id = k.user_id and f.category = 'credit') as applied
    from kakao_links k left join legacy_members l on l.warp_id = k.warp_id
    where k.template_key = ${CREDIT_INVITE_KEY} and k.expires_at > now() order by k.created_at`;
  const site = (process.env.SITE_URL || "https://moducarpool.com").replace(/\/$/, "");
  const header = ["구분", "고유번호", "이메일", "전화번호 있음", "링크", "누른 횟수", "이관 신청함", "링크 만료(한국시간)", "보낼 문구"];
  const lines = rows.map((r) => {
    const link = `${site}/s/${r.code}`;
    return [r.nw ? "신워프" : "구워프", r.warp_id, r.email_norm, r.has_phone ? "O" : "X", link, r.clicks, r.applied ? "O" : "X", kst(r.expires_at as string), creditInviteText(link)];
  });
  const csv = "\ufeff" + [header, ...lines].map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="credit-invite-links-${today()}.csv"`, "Cache-Control": "no-store" } });
}

/**
 * POST {action:"links", groups:[...], warp:"all"|"new"|"old", limit}: 크레딧 이관 안내 링크 만들기(2026-11-17 사용자 지시).
 * 고른 묶음에서 전화가 있고 아직 유효한 이관 링크가 없는 분만, 한 번에 최대 300명. 계정이 없으면 워프 명단 메일로 임시 계정을 만든다.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  if (b.action !== "links") return json({ error: "알 수 없는 요청이에요." }, 400);
  const groups = (Array.isArray(b.groups) ? b.groups : []).filter((g): g is SmsGroup => typeof g === "string" && g in SMS_GROUP_LABEL);
  if (!groups.length) return json({ error: "묶음을 골라 주세요." }, 400);
  const warp = b.warp === "new" || b.warp === "old" ? b.warp : "all";
  const limit = Math.max(1, Math.min(300, Math.round(Number(b.limit) || 100)));
  try {
    await ensureSchema();
    const sql = db();
    const have = new Set((await sql`select warp_id from kakao_links where template_key = ${CREDIT_INVITE_KEY} and expires_at > now()`).map((r) => String(r.warp_id)));
    const pick = (await smsTargets())
      .filter((x) => x.phone && groups.includes(x.group) && (warp === "all" || (warp === "new") === x.newWarp) && !have.has(x.code))
      .sort((a, b2) => groups.indexOf(a.group) - groups.indexOf(b2.group))
      .slice(0, limit);
    let made = 0, skipped = 0;
    const deadline = Date.now() + 45_000;
    for (const p of pick) {
      if (Date.now() > deadline) break;
      const acc = await ensureAccount(p.code);
      if (!acc) { skipped += 1; continue; }
      await makeLink(acc.userId, p.code, CREDIT_INVITE_KEY, "credit");
      made += 1;
    }
    return json({ ok: true, made, skipped, left: Math.max(0, pick.length - made - skipped), links: await linkCount() });
  } catch (e) {
    return fail(e);
  }
}
