import { db } from "./server";
import { SITE_URL as SITE } from "./site";

/**
 * 가입 메일로 보내는 알림.
 * RESEND_API_KEY 와 MAIL_FROM(예: "모두의카풀 <noreply@내도메인>")이 있어야 실제로 나간다.
 * 알림이 실패해도 본래 동작(신청·대화)은 그대로 성공해야 하므로 오류는 기록만 한다.
 */
export const mailEnabled = () => (!!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM) || process.env.MAIL_DRYRUN === "1";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

type Kind = "request" | "accepted" | "hello";
const copy: Record<Kind, (from: string, route: string) => { subject: string; lead: string; button: string }> = {
  request: (from, route) => ({ subject: `[모두의카풀] ${from} 님이 카풀을 신청했어요`, lead: `${from} 님이 "${route}" 카풀을 신청했습니다. 신청을 확인하고 수락하거나 거절해 주세요.`, button: "신청 확인하기" }),
  accepted: (from, route) => ({ subject: `[모두의카풀] ${from} 님이 카풀 신청을 수락했어요`, lead: `${from} 님이 "${route}" 카풀 신청을 수락했습니다. 이제 채팅으로 만날 곳과 시간을 정해 보세요.`, button: "대화하러 가기" }),
  hello: (from, route) => ({ subject: `[모두의카풀] ${from} 님이 첫 메시지를 보냈어요`, lead: `${from} 님이 "${route}" 카풀 채팅에서 첫 메시지를 보냈습니다.`, button: "메시지 확인하기" }),
};

/** 비밀번호 재설정 메일. 알림 수신 설정과 관계없이 보낸다. */
export async function sendResetMail(to: string, link: string) {
  if (!mailEnabled()) return false;
  const subject = "[모두의카풀] 비밀번호 재설정 안내";
  const lead = "비밀번호 재설정을 요청하셨습니다. 아래 버튼을 눌러 30분 안에 새 비밀번호를 정해 주세요.";
  const note = "요청하지 않으셨다면 이 메일을 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.";
  if (process.env.MAIL_DRYRUN === "1") {
    console.log(`[mail] to=${to} | ${subject} | ${link}`);
    return true;
  }
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">새 비밀번호 정하기</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">${note}</p>
</div></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text: `${lead}\n\n${link}\n\n${note}` }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) console.error("[mail]", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[mail]", e);
    return false;
  }
}

export const siteUrl = () => SITE;

/** 가입 메일 인증. 알림 수신 설정과 관계없이 보낸다. */
export async function sendVerifyMail(to: string, link: string) {
  if (!mailEnabled()) return false;
  const subject = "[모두의카풀] 이메일 인증을 완료해 주세요";
  const lead = "모두의카풀에 가입해 주셔서 고마워요. 아래 버튼을 눌러 이메일 인증을 마치면 카풀 글쓰기와 신청을 할 수 있어요.";
  const note = "링크는 24시간 동안 쓸 수 있어요. 직접 가입하지 않으셨다면 이 메일을 무시해 주세요.";
  if (process.env.MAIL_DRYRUN === "1") {
    console.log(`[mail] to=${to} | ${subject} | ${link}`);
    return true;
  }
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${lead}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">이메일 인증하기</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">${note}</p>
</div></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text: `${lead}\n\n${link}\n\n${note}` }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) console.error("[mail]", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[mail]", e);
    return false;
  }
}

/** 메일로 알리기: 읽지 않은 메시지 수와 마지막 메시지를 보낸다. 받는 사람이 알림을 껐으면 보내지 않는다. */
export async function nudgeMail(toUserId: string, fromName: string, route: string, count: number, last: string, path: string) {
  if (!mailEnabled()) return false;
  const rows = await db()`select email from users where id = ${toUserId} and notify and not test and not blocked`;
  if (!rows.length) return false;
  const to = String(rows[0].email);
  const from = fromName || "회원";
  const subject = `[모두의카풀] ${from} 님의 메시지 ${count}개를 아직 확인하지 않으셨어요`;
  const lead = `"${route}" 카풀 채팅에서 ${from} 님이 메시지를 기다리고 있어요.`;
  const link = `${SITE}${path}`;
  if (process.env.MAIL_DRYRUN === "1") {
    console.log(`[mail] to=${to} | ${subject} | ${last} | ${link}`);
    return true;
  }
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(lead)}</p>
<p style="margin:0 0 16px;padding:12px 14px;background:#F5F7FA;border-radius:12px;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(last)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">메시지 확인하기</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">상대 회원이 보낸 알림 요청입니다. 받고 싶지 않으면 내 정보에서 "메일 알림"을 꺼 주세요.</p>
</div></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text: `${lead}\n\n"${last}"\n\n${link}` }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) console.error("[mail]", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[mail]", e);
    return false;
  }
}

export async function notify(toUserId: string, kind: Kind, fromName: string, route: string, quote = "") {
  if (!mailEnabled()) return;
  try {
    const rows = await db()`select email, name from users where id = ${toUserId} and notify and not test and not blocked`;
    if (!rows.length) return;
    const to = String(rows[0].email);
    const c = copy[kind](fromName || "회원", route);
    if (process.env.MAIL_DRYRUN === "1") return console.log(`[mail] to=${to} | ${c.subject} | ${quote}`);
    const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(c.lead)}</p>
${quote ? `<p style="margin:0 0 16px;padding:12px 14px;background:#F5F7FA;border-radius:12px;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(quote)}</p>` : ""}
<a href="${SITE}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">${c.button}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8B95A1">이 메일은 모두의카풀 가입 메일로 보내는 알림입니다. 받고 싶지 않으면 내 정보에서 "메일 알림"을 꺼 주세요.</p>
</div></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject: c.subject, html, text: `${c.lead}\n${quote ? `\n"${quote}"\n` : ""}\n${SITE}` }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.error("[mail]", res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error("[mail]", e);
  }
}
