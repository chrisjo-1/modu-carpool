import { db } from "./server";
import { siteLinkBlock, type MailCategory } from "./mail";
import { SITE_URL as SITE } from "./site";
import { APPLE_MAIL_DOMAINS } from "./appleMail";

/** 발송 대상 그룹(화면에서 고르는 3개) + 예전 캠페인이 쓰던 대상(표시용으로만 남김) */
export type Segment = "members" | "pw_unset" | "warp_unjoined" | "new_warp" | "legacy_joined" | "legacy_unjoined";
export const SEGMENTS: [Segment, string][] = [
  ["members", "현재 모두의카풀 가입자"],
  ["pw_unset", "코드 있음 · 모두의카풀 비번 미설정"],
  ["warp_unjoined", "구워프 미가입자 (가입 안 한 워프 회원, 이메일 있음)"],
];
export const SEGMENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(SEGMENTS),
  new_warp: "신워프 회원 (모두의카풀로 이전 완료)",
  legacy_joined: "구워프 회원 이전 완료",
  legacy_unjoined: "구워프 미가입자 (이메일 있음)",
};

/** marketing: 광고성 메일이면 true. subject: 같은 제목을 이미 받은 주소는 뺀다. segments: 고른 그룹(하나 이상, 같은 사람은 한 번만). */
export type Audience = {
  segments: Segment[];
  onlyConsent: boolean;
  onlyDriver: boolean;
  marketing?: boolean;
  subject?: string;
  /** 다시 보내기: 이 캠페인을 받았지만 열지 않은(open) / 링크를 누르지 않은(click) 사람만 */
  followUpOf?: string | null;
  followUpMode?: "open" | "click" | "";
  /** 이 캠페인들 중 하나라도 보낸 적이 있는 주소는 제목과 상관없이 뺀다 */
  exceptCampaigns?: string[];
};
export const FOLLOWUP_LABEL: Record<string, string> = { open: "안 연 사람만", click: "링크 안 누른 사람만" };

/** 광고성 메일은 같은 회원에게 이 기간(일) 안에 한 번만 보낸다 */
export const MARKETING_GAP_DAYS = 7;

/**
 * 대상자 목록. 고른 그룹을 모두 합치고, 같은 이메일은 한 번만 넣는다(가입 회원 정보가 있는 쪽을 우선).
 * 아이폰 메일(APPLE_MAIL_DOMAINS)은 메일이 닿지 않아 뺀다. 캠페인 생성 시각 이전에 만들어진 회원만 포함하고,
 * 이미 이 캠페인으로 처리한 주소는 뺀다. 단, 발송 한도(429)로 실패한 주소는 다시 대상이 된다(실패분 재발송).
 */
export async function audienceRows(a: Audience, opt: { campaignId?: string | null; before?: string | null; limit?: number } = {}): Promise<{ user_id: string | null; email: string }[]> {
  const sql = db();
  const cid = opt.campaignId ?? null;
  const before = opt.before ?? null;
  const lim = Math.min(Math.max(opt.limit ?? 100000, 1), 100000);
  // 다시 보내기는 같은 제목이어도 보내야 하므로 '같은 제목 이미 받음' 확인을 건너뛴다.
  const fof: string | null = a.followUpOf && a.followUpMode ? a.followUpOf : null;
  const fmode = a.followUpMode === "click" ? "click" : "open";
  const subj: string | null = fof ? null : (a.subject ?? "").trim() || null;
  const mk = a.marketing === true;
  const exc: string[] = a.exceptCampaigns ?? [];
  const has = (s: Segment) => a.segments.includes(s);
  const inUsers = has("members") || has("pw_unset") || has("new_warp") || has("legacy_joined");
  const inLegacy = has("warp_unjoined") || has("legacy_unjoined");
  const byEmail = new Map<string, { user_id: string | null; email: string }>();
  const put = (r: { user_id: string | null; email: string }) => {
    if (!byEmail.has(r.email) || r.user_id) byEmail.set(r.email, r);
  };

  // 명부 쪽(구워프 명단): 동의 정보가 없어 광고성·운전자 조건과 맞지 않으므로 안내 메일에서만 쓴다.
  if (inLegacy && !a.onlyConsent && !a.onlyDriver) {
    const rows = (await sql`select null::uuid as user_id, lower(l.email_norm) as email from legacy_members l
      where not l.withdrawn and coalesce(l.email_norm, '') <> ''
        and split_part(lower(l.email_norm), '@', 2) <> all(${APPLE_MAIL_DOMAINS}::text[])
        and (${before}::timestamptz is null or l.imported_at <= ${before}::timestamptz)
        and (
          (${has("warp_unjoined") || has("legacy_unjoined")} and l.matched_user is null and not exists (select 1 from users u where lower(u.email) = lower(l.email_norm)))
        )
        and (${cid}::uuid is null or not exists (select 1 from mail_log g where g.campaign_id = ${cid}::uuid and g.to_email = lower(l.email_norm) and not (g.status = 'failed' and g.error like '429%')))
        and (${subj}::text is null or not exists (select 1 from mail_log g3 where g3.to_email = lower(l.email_norm) and g3.subject = ${subj}::text and g3.status = 'sent'))
        and (${fof}::uuid is not null or not exists (select 1 from mail_log g5 where g5.to_email = lower(l.email_norm) and g5.status = 'sent' and g5.campaign_id is not null))
        and (${fof}::uuid is null or (exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(l.email_norm) and f.status = 'sent')
          and not exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(l.email_norm)
            and (case when ${fmode} = 'click' then f.clicked_at else coalesce(f.opened_at, f.clicked_at) end) is not null)))
        and not exists (select 1 from mail_log x where x.to_email = lower(l.email_norm) and x.status = 'sent' and x.campaign_id::text = any(${exc}::text[]))
      order by email limit ${lim}`) as { user_id: string | null; email: string }[];
    rows.forEach(put);
  }

  // 가입 회원 쪽
  if (inUsers) {
    const rows = (await sql`select u.id as user_id, lower(u.email) as email from users u
      where not u.test and not u.blocked and u.withdrawn_at is null and coalesce(u.email, '') <> ''
        and split_part(lower(u.email), '@', 2) <> all(${APPLE_MAIL_DOMAINS}::text[])
        and (${before}::timestamptz is null or u.created_at <= ${before}::timestamptz)
        and (
          ${has("members")}
          or (${has("pw_unset")} and u.pw_reset_required and exists (select 1 from legacy_members l where l.matched_user = u.id and not l.withdrawn and coalesce(trim(l.warp_id), '') <> ''))
          or (${has("new_warp")} and exists (select 1 from legacy_members l where l.matched_user = u.id and l.src_no like '신워프%'))
          or (${has("legacy_joined")} and exists (select 1 from legacy_members l where l.matched_user = u.id and l.src_no not like '신워프%'))
        )
        and (${a.onlyConsent} = false or u.marketing = true)
        and (${a.onlyDriver} = false or (u.car_no <> '' and u.car_v > 0))
        and (${cid}::uuid is null or not exists (select 1 from mail_log g where g.campaign_id = ${cid}::uuid and g.to_email = lower(u.email) and not (g.status = 'failed' and g.error like '429%')))
        and (${subj}::text is null or not exists (select 1 from mail_log g2 where g2.to_email = lower(u.email) and g2.subject = ${subj}::text and g2.status = 'sent'))
        and (${fof}::uuid is not null or not exists (select 1 from mail_log g6 where g6.to_email = lower(u.email) and g6.status = 'sent' and g6.campaign_id is not null))
        and (${fof}::uuid is null or (exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(u.email) and f.status = 'sent')
          and not exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(u.email)
            and (case when ${fmode} = 'click' then f.clicked_at else coalesce(f.opened_at, f.clicked_at) end) is not null)))
        and (${mk} = false or not exists (select 1 from mail_log g4 where g4.to_email = lower(u.email) and g4.category = 'marketing' and g4.status = 'sent' and g4.created_at > now() - make_interval(days => ${MARKETING_GAP_DAYS}::int)))
        and not exists (select 1 from mail_log x where x.to_email = lower(u.email) and x.status = 'sent' and x.campaign_id::text = any(${exc}::text[]))
      order by email limit ${lim}`) as { user_id: string | null; email: string }[];
    rows.forEach(put);
  }

  return [...byEmail.values()].sort((x, y) => (x.email < y.email ? -1 : x.email > y.email ? 1 : 0)).slice(0, lim);
}

/**
 * 발송 화면의 대상 설명: 고른 그룹을 합친 인원과, 그룹별 인원, 왜 빠졌는지(같은 제목 받음 / 고른 캠페인 받음).
 */
export async function audienceSummary(a: Audience): Promise<{
  count: number; pool: number; excludedBySubject: number; excludedByCampaigns: number;
  groups: Record<string, number>;
}> {
  const pool = (await audienceRows({ ...a, subject: "", exceptCampaigns: [] }, { limit: 100000 })).length;
  const afterSubject = (await audienceRows({ ...a, exceptCampaigns: [] }, { limit: 100000 })).length;
  const count = (await audienceRows(a, { limit: 100000 })).length;
  const groups: Record<string, number> = {};
  for (const [key] of SEGMENTS) {
    groups[key] = (await audienceRows({ ...a, segments: [key] }, { limit: 100000 })).length;
  }
  return { count, pool, excludedBySubject: pool - afterSubject, excludedByCampaigns: afterSubject - count, groups };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** 본문 텍스트를 메일 모양으로 바꾼다. 빈 줄은 문단, 줄바꿈은 줄바꿈으로 둔다. */
/** 개인정보 보관·삭제 안내(대량·공지 메일 맨 아래). 링크를 누르면 로그인 없이 '탈퇴 여부 확인' 창이 열린다. */
export const LEAVE_URL = `${SITE}/?leave=1`;
export const RETENTION_TEXT = `개인정보 최소화 안내: 모두의카풀은 개인정보를 최소한으로만 보관하도록 정책을 바꿔 휴대폰 번호 등 개인정보를 삭제하기로 했습니다. 메일 발송 시 개인정보는 5년간 보관하도록 되어 있어, 개인정보 삭제에 동의해 주셔야 삭제가 가능합니다. 동의 처리가 되지 않은 경우에는 휴대폰을 이용한 안내가 불가피한 점 양해 부탁드립니다.\n개인정보 삭제 동의하기: ${LEAVE_URL}`;
export function retentionBlock(): string {
  return `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">개인정보 최소화 안내: 모두의카풀은 개인정보를 최소한으로만 보관하도록 정책을 바꿔 휴대폰 번호 등 개인정보를 삭제하기로 했습니다. 메일 발송 시 개인정보는 5년간 보관하도록 되어 있어, 개인정보 삭제에 동의해 주셔야 삭제가 가능합니다. 동의 처리가 되지 않은 경우에는 휴대폰을 이용한 안내가 불가피한 점 양해 부탁드립니다. <a href="${LEAVE_URL}" style="color:#8B95A1;text-decoration:underline">개인정보 삭제 동의하기</a></p>`;
}

export function renderHtml(text: string): string {
  const paras = text.trim().split(/\n\s*\n/).map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
    .replace(/\{\{img:([0-9a-f-]{36})\}\}/g, (_m, id: string) => `<img src="${SITE}/api/mail/image/${id}" alt="" style="display:block;max-width:100%;height:auto;margin:0 0 16px;border-radius:12px" />`)
    // 사이트에 함께 배포한 메일용 그림(public/mail/*.png|jpg): {{img:/mail/파일이름}}
    .replace(/\{\{img:(\/mail\/[a-z0-9-]+\.(?:png|jpg))\}\}/g, (_m, path: string) => `<img src="${SITE}${path}" alt="" width="432" style="display:block;width:100%;max-width:432px;height:auto;margin:0 0 16px;border-radius:12px;border:1px solid #E5E8EB" />`);
  return `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
${paras}
<div style="border-top:1px solid #E5E8EB;margin-top:8px;padding-top:16px">${siteLinkBlock()}${retentionBlock()}</div>
</div></div>`;
}

const SELECTABLE = new Set<string>(SEGMENTS.map((x) => x[0]));
/** 화면에서 고른 대상 그룹(여러 개 가능). 'segments' 배열 또는 쉼표로 이어 쓴 'segment' 문자열을 받는다. */
export function parseSegments(b: Record<string, unknown>): Segment[] {
  const raw: unknown[] = Array.isArray(b.segments) ? b.segments : typeof b.segment === "string" ? b.segment.split(",") : [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && SELECTABLE.has(x)))] as Segment[];
}
export function parseAudience(b: Record<string, unknown>): Audience | null {
  const segments = parseSegments(b);
  if (!segments.length) return null;
  const fof = typeof b.followUpOf === "string" && /^[0-9a-f-]{36}$/i.test(b.followUpOf) ? b.followUpOf : null;
  const fmode = b.followUpMode === "click" ? "click" : b.followUpMode === "open" ? "open" : "";
  const exceptCampaigns = Array.isArray(b.exceptCampaigns) ? b.exceptCampaigns.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)) : [];
  return {
    exceptCampaigns,
    segments,
    onlyConsent: b.onlyConsent === true,
    onlyDriver: b.onlyDriver === true,
    marketing: b.category === "marketing",
    subject: typeof b.subject === "string" ? b.subject.trim() : "",
    followUpOf: fof && fmode ? fof : null,
    followUpMode: fof ? fmode : "",
  };
}
