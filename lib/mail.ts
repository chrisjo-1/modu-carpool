import { db, ensureSchema } from "./server";
import { SITE_URL as SITE } from "./site";

/**
 * 메일 발송 공통 경로. 모든 메일은 deliver()를 거쳐 나가고, 결과(발송·실패·차단·테스트)가 mail_log에 남는다.
 * RESEND_API_KEY 와 MAIL_FROM(예: "모두의카풀 <noreply@내도메인>")이 있어야 실제로 나간다.
 * 알림이 실패해도 본래 동작(신청·대화)은 그대로 성공해야 하므로 오류는 기록만 한다.
 */
export const mailEnabled = () => (!!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM) || process.env.MAIL_DRYRUN === "1";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** 구분: transactional = 계정·거래 안내(항상 발송), marketing = 광고성·홍보성(정책 적용) */
export type MailCategory = "transactional" | "marketing";

/** 메일 정책. 관리자 메일 탭에서 바꾼다. 광고성 메일에만 적용한다. */
export type MailPolicy = { dailyCap: number; quietOn: boolean; quietFrom: number; quietTo: number; marketingOn: boolean; requireConsent: boolean };
export const DEFAULT_POLICY: MailPolicy = { dailyCap: 100, quietOn: true, quietFrom: 21, quietTo: 8, marketingOn: false, requireConsent: true };

export async function getPolicy(): Promise<MailPolicy> {
  await ensureSchema();
  const r = await db()`select daily_cap, quiet_on, quiet_from, quiet_to, marketing_on, require_consent from mail_policy where id = 1`;
  if (!r.length) return DEFAULT_POLICY;
  const x = r[0];
  return {
    dailyCap: Number(x.daily_cap),
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

type Mail = { kind: string; category: MailCategory; to: string; userId?: string | null; subject: string; html: string; text: string };

async function record(m: Mail, status: string, error = "", providerId = "") {
  try {
    await db()`insert into mail_log (kind, category, to_email, user_id, subject, status, error, provider_id)
      values (${m.kind}, ${m.category}, ${m.to}, ${m.userId ?? null}, ${m.subject.slice(0, 200)}, ${status}, ${error.slice(0, 300)}, ${providerId.slice(0, 100)})`;
  } catch (e) {
    console.error("[mail-log]", e);
  }
}

/** 광고성 메일을 정책으로 막을 수 있으면 사유를 돌려준다. 막지 않으면 빈 문자열. */
async function blockReason(m: Mail): Promise<string> {
  const p = await getPolicy();
  if (!p.marketingOn) return "광고성 메일 발송이 꺼져 있음";
  if (inQuietHours(p)) return `야간 발송 제한 시간(${p.quietFrom}시~${p.quietTo}시)`;
  if (p.requireConsent) {
    if (!m.userId) return "수신 동의 확인 불가(가입 회원이 아님)";
    const u = await db()`select marketing from users where id = ${m.userId}`;
    if (u[0]?.marketing !== true) return "광고성 메일 수신 동의 없음";
  }
  const n = await db()`select count(*)::int as n from mail_log
    where category = 'marketing' and status = 'sent' and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')`;
  if ((n[0].n as number) >= p.dailyCap) return `하루 발송 한도(${p.dailyCap}통) 초과`;
  return "";
}

/** 메일을 보내고 이력을 남긴다. 성공하면 true. */
export async function deliver(m: Mail): Promise<boolean> {
  try {
    if (m.category === "marketing") {
      const why = await blockReason(m);
      if (why) {
        console.log(`[mail] blocked ${m.kind} to=${m.to}: ${why}`);
        await record(m, "blocked", why);
        return false;
      }
    }
    if (process.env.MAIL_DRYRUN === "1") {
      console.log(`[mail] to=${m.to} | ${m.subject}`);
      await record(m, "dryrun");
      return true;
    }
    if (!mailEnabled()) {
      await record(m, "disabled", "RESEND_API_KEY 또는 MAIL_FROM 없음");
      return false;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      signal: AbortSignal.timeout(6000),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      const err = `${res.status} ${j.message ?? ""}`.trim();
      console.error("[mail]", err);
      await record(m, "failed", err);
      return false;
    }
    await record(m, "sent", "", String(j.id ?? ""));
    return true;
  } catch (e) {
    console.error("[mail]", e);
    await record(m, "failed", String(e));
    return false;
  }
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
export async function sendWithdrawConfirmMail(to: string, link: string, kind: "withdraw" | "purge" = "withdraw") {
  const purge = kind === "purge";
  const subject = purge ? "[모두의카풀] 개인정보 삭제 확인" : "[모두의카풀] 탈퇴 신청 확인";
  const lead = purge
    ? "계속 이용하시려면 가입 때 받은 개인정보(이름, 전화번호, 연락처, SNS 아이디 등)를 삭제해야 해요. 본인이 맞다면 아래 버튼을 눌러 확인해 주세요. 이메일 주소는 남아요. 확인 후에는 비밀번호 찾기로 새 비밀번호를 정해 주세요."
    : "모두의카풀 탈퇴를 신청하셨어요. 본인이 맞다면 아래 버튼을 눌러 탈퇴를 완료해 주세요. 탈퇴하면 개인정보는 삭제되고 이메일 주소만 남아요.";
  const note = "본인이 요청하지 않았다면 이 메일을 무시해 주세요. 링크는 72시간 동안 쓸 수 있어요.";
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">${purge ? "개인정보 삭제 확인하기" : "탈퇴 확인하기"}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">${note}</p>
</div></div>`;
  return deliver({ kind, category: "transactional", to, subject, html, text: `${lead}\n\n${link}\n\n${note}` });
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
