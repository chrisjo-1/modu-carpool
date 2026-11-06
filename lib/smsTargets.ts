import { APPLE_MAIL_DOMAINS } from "./appleMail";
import { db } from "./server";

/**
 * 문자·알림톡 안내 대상(2026-11-06 사용자 지시: "메일을 안 봤거나 잘못된 메일·아이폰 메일이라 알리지 못한 회원 명단").
 * 알림톡·문자는 워프 회원을 모두의카풀로 들어오게 하는 안내에만 쓴다(CLAUDE.md 남은 일 '워프 재가입 단계 발송').
 * 대상 = 워프 명단(legacy_members) 중 탈퇴 안 함 + 아직 모두의카풀을 쓰지 않음(계정 없음, 또는 비번 미설정·접속 기록 없음).
 * 그룹(앞 순서가 우선):
 *   apple  아이폰 메일 — 대량 메일에서 빠져 한 번도 못 받음
 *   bad    반송·잘못된 메일 — 빈 주소·형식 오류·반송 기록
 *   unread 메일을 받고 2일이 지났는데 열거나 누른 기록이 없음(10/29 전 메일은 열람 기록이 없어 모두 '안 열어 봄'으로 셈)
 *   none   아직 메일을 보내지 않음 — 문자보다 메일이 먼저(싸고 빠름)
 *   (최근 2일 안에 보낸 사람, 열어 본 사람은 대상 아님)
 * 전화번호 자체는 이 함수 밖으로 내보내지 않는다(있음/없음만). 문자 발송 코드가 서버에서 직접 읽는다.
 */
export type SmsGroup = "apple" | "bad" | "unread" | "none";
export const SMS_GROUP_LABEL: Record<SmsGroup, string> = {
  apple: "아이폰 메일(메일 못 받음)",
  bad: "반송·잘못된 메일",
  unread: "메일 안 열어 봄",
  none: "아직 메일 안 보냄",
};

export type SmsTarget = { group: SmsGroup; newWarp: boolean; code: string; email: string; phone: boolean; account: boolean; lastMail: string | null };

export async function smsTargets(): Promise<SmsTarget[]> {
  // 메일 기록은 주소별로 한 번만 모아서 붙인다(사람마다 찾으면 4만 명 × 기록이라 몇 분 걸림)
  const r = await db()`
    with g as (
      select lower(to_email) as em, max(created_at) filter (where status = 'sent') as last_sent,
             bool_or(status = 'sent' and (opened_at is not null or clicked_at is not null)) as opened,
             bool_or(bounced_at is not null) as bounced
      from mail_log group by 1
    ), sup as (select distinct email from mail_suppressions where reason = 'bounce'),
    m as (
      select l.warp_id, l.src_no like '신워프%' as nw, coalesce(l.email_norm, '') as em,
             coalesce(l.phone_norm, '') ~ '^01[0-9]{8,9}$' as has_phone, u.id as uid,
             split_part(coalesce(l.email_norm, ''), '@', 2) = any(${APPLE_MAIL_DOMAINS}::text[]) as apple,
             (coalesce(l.email_norm, '') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][a-z]{2,}$' or sup.email is not null or coalesce(g.bounced, false)) as bad,
             g.last_sent, coalesce(g.opened, false) as opened
      from legacy_members l
      left join users u on u.id = l.matched_user
      left join g on g.em = l.email_norm
      left join sup on sup.email = l.email_norm
      where not l.withdrawn
        and (u.id is null or (u.withdrawn_at is null and not u.blocked and not u.test and u.pw_reset_required and u.last_seen is null))
    )
    select warp_id, nw, em, has_phone, uid is not null as account, last_sent,
      case when apple then 'apple' when bad then 'bad' when opened then '' when last_sent is null then 'none'
           when last_sent < now() - interval '2 days' then 'unread' else '' end as grp
    from m`;
  return r
    .filter((x) => x.grp)
    .map((x) => ({
      group: String(x.grp) as SmsGroup,
      newWarp: !!x.nw,
      code: String(x.warp_id),
      email: String(x.em),
      phone: !!x.has_phone,
      account: !!x.account,
      lastMail: x.last_sent ? new Date(x.last_sent as string).toISOString() : null,
    }));
}

/** 그룹 × 신·구워프별 인원과 전화번호 있는 인원 */
export function smsSummary(list: SmsTarget[]) {
  const out = (Object.keys(SMS_GROUP_LABEL) as SmsGroup[]).map((g) => {
    const rows = list.filter((x) => x.group === g);
    const nw = rows.filter((x) => x.newWarp);
    const ow = rows.filter((x) => !x.newWarp);
    return {
      group: g, label: SMS_GROUP_LABEL[g], total: rows.length, phone: rows.filter((x) => x.phone).length,
      newWarp: nw.length, newWarpPhone: nw.filter((x) => x.phone).length, oldWarp: ow.length, oldWarpPhone: ow.filter((x) => x.phone).length,
    };
  });
  return out;
}
