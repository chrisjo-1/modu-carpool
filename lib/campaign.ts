import { db } from "./server";
import { siteLinkBlock, type MailCategory } from "./mail";
import { SITE_URL as SITE } from "./site";
import { APPLE_MAIL_DOMAINS } from "./appleMail";

export type Segment = "members" | "new_warp" | "legacy_joined" | "legacy_unjoined";
export const SEGMENTS: [Segment, string][] = [
  ["members", "가입 회원 전체"],
  ["new_warp", "신워프 회원 (모두의카풀로 이전 완료)"],
  ["legacy_joined", "구워프 회원 이전 완료"],
  ["legacy_unjoined", "구워프 미가입자 (이메일 있음)"],
];

/** marketing: 광고성 메일이면 true. subject: 같은 제목을 이미 받은 주소는 뺀다. */
export type Audience = {
  segment: Segment;
  onlyConsent: boolean;
  onlyDriver: boolean;
  marketing?: boolean;
  subject?: string;
  /** 다시 보내기: 이 캠페인을 받았지만 열지 않은(open) / 링크를 누르지 않은(click) 사람만 */
  followUpOf?: string | null;
  followUpMode?: "open" | "click" | "";
};
export const FOLLOWUP_LABEL: Record<string, string> = { open: "안 연 사람만", click: "링크 안 누른 사람만" };

/** 광고성 메일은 같은 회원에게 이 기간(일) 안에 한 번만 보낸다 */
export const MARKETING_GAP_DAYS = 7;

/** 발송 종류 템플릿. 문구는 초안이므로 발송 전에 반드시 검토한다. */
export const TEMPLATES: { key: string; label: string; category: MailCategory; subject: string; body: string }[] = [
  {
    key: "legacy-privacy",
    label: "구워프 회원 안내 (개인정보 삭제·탈퇴 방법)",
    category: "transactional",
    subject: "[모두의카풀] 워프 회원 정보 이용 안내",
    body: "안녕하세요, 모두의카풀입니다.\n\n워프에서 가입하셨던 회원님께 개인정보 이용 내용을 알려 드립니다.\n\n현재 모두의카풀에서는 회원님의 정보를 최소한으로만 보관하고 있습니다. 더 이상 이용을 원하지 않으시면 탈퇴하실 수 있고, 계속 이용하시더라도 개인정보만 삭제하실 수 있습니다.\n\n탈퇴·개인정보 삭제 방법: 모두의카풀 앱 또는 웹사이트에 로그인해 내 정보 > 탈퇴 신청을 선택해 주세요.\n\n문의: 모두의카풀 고객센터",
  },
  {
    key: "new-warp-welcome",
    label: "신워프 회원 안내 (모두의카풀 이전 완료)",
    category: "transactional",
    subject: "[모두의카풀] 모두의카풀 계정이 준비되었어요",
    body: "안녕하세요, 모두의카풀입니다.\n\n워프 회원님의 모두의카풀 계정이 준비되었습니다.\n\n계정은 이 메일 주소로 만들어 두었습니다. 로그인하시려면 비밀번호 찾기로 새 비밀번호를 정해 주세요.\n\n로그인하기: " + SITE,
  },
  {
    key: "promo-taxi-subway",
    label: "광고: 택시 동승·지하철 자리나눔 출시 소식",
    category: "marketing",
    subject: "(광고) 모두의카풀에 택시 동승과 지하철 자리나눔이 곧 열려요",
    body: "안녕하세요, 모두의카풀입니다.\n\n모두의카풀에 택시 동승과 지하철 자리나눔 서비스를 준비하고 있어요. 이용 후기와 의견을 받아 함께 만들어 가겠습니다.\n\n지금 모두의카풀에서 확인해 보세요: " + SITE,
  },
  { key: "custom", label: "직접 작성", category: "transactional", subject: "", body: "" },
];

/** 대상자 목록. 아이폰 메일(APPLE_MAIL_DOMAINS)은 메일이 닿지 않아 빼고 문자 전용 명단으로 돌린다. 캠페인 생성 시각 이전에 가입한 회원만 포함하고, 이미 이 캠페인으로 처리한 주소는 뺀다.
 * 단, 발송 한도(429)로 실패한 주소는 다시 대상이 된다(실패분 재발송). */
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
  if (a.segment === "legacy_unjoined") {
    // 구워프 미가입자는 동의 정보가 없어 광고성 조건과 맞지 않는다(안내 메일 전용)
    if (a.onlyConsent || a.onlyDriver) return [];
    return (await sql`select null::uuid as user_id, lower(l.email_norm) as email from legacy_members l
      where l.matched_user is null and not l.withdrawn and coalesce(l.email_norm, '') <> ''
        and split_part(lower(l.email_norm), '@', 2) <> all(${APPLE_MAIL_DOMAINS}::text[])
        and (${before}::timestamptz is null or l.imported_at <= ${before}::timestamptz)
        and not exists (select 1 from users u where lower(u.email) = lower(l.email_norm))
        and (${cid}::uuid is null or not exists (select 1 from mail_log g where g.campaign_id = ${cid}::uuid and g.to_email = lower(l.email_norm) and not (g.status = 'failed' and g.error like '429%')))
        and (${subj}::text is null or not exists (select 1 from mail_log g3 where g3.to_email = lower(l.email_norm) and g3.subject = ${subj}::text and g3.status = 'sent'))
        and (${fof}::uuid is null or (exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(l.email_norm) and f.status = 'sent')
          and not exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(l.email_norm)
            and (case when ${fmode} = 'click' then f.clicked_at else coalesce(f.opened_at, f.clicked_at) end) is not null)))
      order by email limit ${lim}`) as { user_id: string | null; email: string }[];
  }
  return (await sql`select u.id as user_id, lower(u.email) as email from users u
    where not u.test and not u.blocked and u.withdrawn_at is null and coalesce(u.email, '') <> ''
      and split_part(lower(u.email), '@', 2) <> all(${APPLE_MAIL_DOMAINS}::text[])
      and (${before}::timestamptz is null or u.created_at <= ${before}::timestamptz)
      and (${a.segment} = 'members'
        or (${a.segment} = 'new_warp' and exists (select 1 from legacy_members l where l.matched_user = u.id and l.src_no like '신워프%'))
        or (${a.segment} = 'legacy_joined' and exists (select 1 from legacy_members l where l.matched_user = u.id and l.src_no not like '신워프%')))
      and (${a.onlyConsent} = false or u.marketing = true)
      and (${a.onlyDriver} = false or (u.car_no <> '' and u.car_v > 0))
      and (${cid}::uuid is null or not exists (select 1 from mail_log g where g.campaign_id = ${cid}::uuid and g.to_email = lower(u.email) and not (g.status = 'failed' and g.error like '429%')))
      and (${subj}::text is null or not exists (select 1 from mail_log g2 where g2.to_email = lower(u.email) and g2.subject = ${subj}::text and g2.status = 'sent'))
      and (${fof}::uuid is null or (exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(u.email) and f.status = 'sent')
        and not exists (select 1 from mail_log f where f.campaign_id = ${fof}::uuid and f.to_email = lower(u.email)
          and (case when ${fmode} = 'click' then f.clicked_at else coalesce(f.opened_at, f.clicked_at) end) is not null)))
      and (${mk} = false or not exists (select 1 from mail_log g4 where g4.to_email = lower(u.email) and g4.category = 'marketing' and g4.status = 'sent' and g4.created_at > now() - make_interval(days => ${MARKETING_GAP_DAYS}::int)))
    order by email limit ${lim}`) as { user_id: string | null; email: string }[];
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
    .replace(/\{\{img:([0-9a-f-]{36})\}\}/g, (_m, id: string) => `<img src="${SITE}/api/mail/image/${id}" alt="" style="display:block;max-width:100%;height:auto;margin:0 0 16px;border-radius:12px" />`);
  return `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
${paras}
<div style="border-top:1px solid #E5E8EB;margin-top:8px;padding-top:16px">${siteLinkBlock()}${retentionBlock()}</div>
</div></div>`;
}

const SEG = new Set<string>(SEGMENTS.map((s) => s[0]));
export function parseAudience(b: Record<string, unknown>): Audience | null {
  const seg = typeof b.segment === "string" && SEG.has(b.segment) ? (b.segment as Segment) : null;
  if (!seg) return null;
  const fof = typeof b.followUpOf === "string" && /^[0-9a-f-]{36}$/i.test(b.followUpOf) ? b.followUpOf : null;
  const fmode = b.followUpMode === "click" ? "click" : b.followUpMode === "open" ? "open" : "";
  return {
    segment: seg,
    onlyConsent: b.onlyConsent === true,
    onlyDriver: b.onlyDriver === true,
    marketing: b.category === "marketing",
    subject: typeof b.subject === "string" ? b.subject.trim() : "",
    followUpOf: fof && fmode ? fof : null,
    followUpMode: fof ? fmode : "",
  };
}
