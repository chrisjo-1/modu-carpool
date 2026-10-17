import { deliverWithStatus } from "@/lib/mail";
import { SITE_URL } from "@/lib/site";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * 관리자에게 접수 알림 메일을 보낸다(신고·의견 등).
 * ADMIN_ALERT_EMAIL 이 없으면 아무것도 보내지 않는다. 실패해도 호출한 쪽의 접수는 막지 않는다.
 * 광고가 아니므로 발송 시간·일일 상한의 영향을 받지 않는다.
 */
export async function alertAdmin(subject: string, lines: [string, string][]): Promise<void> {
  const to = (process.env.ADMIN_ALERT_EMAIL ?? "").trim();
  if (!to) return;
  const origin = SITE_URL.replace(/\/$/, "");
  const body = lines.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:24px">
<p style="margin:0 0 16px;font-size:16px;font-weight:700">${esc(subject)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6">
${lines.map(([k, v]) => `<tr><td style="padding:6px 8px 6px 0;vertical-align:top;color:#8B95A1;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap;word-break:break-word">${esc(v)}</td></tr>`).join("")}
</table>
<p style="margin:20px 0 0"><a href="${origin}/admin" style="color:#2F6BFF;font-weight:700">관리자 화면 열기</a></p>
</div></div>`;
  try {
    await deliverWithStatus({ kind: "admin_alert", category: "transactional", to, subject, html, text: `${subject}\n\n${body}\n\n${origin}/admin` });
  } catch (e) {
    console.error("[alertAdmin]", e);
  }
}
