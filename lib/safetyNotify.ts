import { deliver, siteUrl } from "./mail";
import { db } from "./server";

/**
 * 안전지킴이 신청되면 관리자(ADMIN_EMAILS 전원)에게 메일을 보낸다(2026-11-04 사용자 지시).
 * 전화번호는 메일에 넣지 않는다. 번호는 관리자 화면에서만 본다.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export async function notifySafetyStart(info: { requesterId: string; requestId: string; origin: string; dest: string; timeGo: string; requesterIsRider: boolean }) {
  const to = (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!to.length) {
    console.warn("[safety] ADMIN_EMAILS 가 비어 있어 안전지킴 신청 알림을 보내지 못했습니다.");
    return;
  }
  const u = await db()`select email, name, member_code from users where id = ${info.requesterId}`;
  const who = u[0] ?? {};
  const role = info.requesterIsRider ? "탑승자" : "운전자";
  const when = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " (KST)";
  const rows: [string, string][] = [
    ["신청자", `${role} · ${String(who.name ?? "") || "이름 없음"}`],
    ["회원번호", String(who.member_code ?? "") || "없음"],
    ["이메일", String(who.email ?? "")],
    ["구간", `${info.origin} → ${info.dest}`],
    ["출근 시각", info.timeGo || "미정"],
    ["신청 시각", when],
    ["대화방 번호", info.requestId],
  ];
  const lead = "안전지킴이 신청되었어요. 상대분의 동의를 기다리는 중이에요. 동의되면 탑승자에게 이동 중 확인 질문이 가요. 전화번호는 관리자 화면 '안전' 탭에서만 볼 수 있어요.";
  const link = `${siteUrl()}/admin`;
  const subject = `[모두의카풀] 안전지킴 신청 · ${info.origin} → ${info.dest}`;
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#C2410C">모두의카풀 · 안전지킴 신청</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(lead)}</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.6;margin:0 0 20px">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#8B95A1;width:110px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`)
    .join("")}</table>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">관리자 화면 열기</a>
</div></div>`;
  const text = `${lead}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${link}`;
  await Promise.all(to.map((addr) => deliver({ kind: "safety-admin", category: "transactional", to: addr, subject, html, text }).catch(() => false)));
}
