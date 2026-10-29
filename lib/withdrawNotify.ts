import { keyedHash } from "./legacy";
import { deliver, siteUrl } from "./mail";
import { db } from "./server";

/**
 * 신워프 회원이 모두의카풀에서 탈퇴(또는 개인정보만 삭제)를 확인하면 관리자(ADMIN_EMAILS 전원)에게 알린다.
 * 워프 쪽에서도 같은 회원을 처리할 수 있게 고유번호를 함께 보낸다(2026-10-29 사용자 지시).
 * 개인정보를 지우기 전에 findNewWarp로 찾아 두고, 처리 뒤 notifyNewWarpLeave로 보낸다.
 */
export type NewWarpHit = { email: string; warpIds: string[]; memberCode: string };

export async function findNewWarp(email: string): Promise<NewWarpHit | null> {
  const sql = db();
  const rows = await sql`select warp_id from legacy_members
    where (email_norm = ${email} or email_h = ${keyedHash(email)}) and src_no like '신워프%'`;
  if (!rows.length) return null;
  const u = await sql`select member_code from users where email = ${email}`;
  return { email, warpIds: rows.map((r) => String(r.warp_id)), memberCode: u.length ? String(u[0].member_code ?? "") : "" };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export async function notifyNewWarpLeave(hit: NewWarpHit, kind: "withdraw" | "purge") {
  const to = (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!to.length) {
    console.warn("[withdraw] ADMIN_EMAILS 가 비어 있어 신워프 탈퇴 알림을 보내지 못했습니다.");
    return;
  }
  const label = kind === "withdraw" ? "탈퇴" : "개인정보만 삭제";
  const when = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " (KST)";
  const rows: [string, string][] = [
    ["구분", label],
    ["신워프 고유번호", hit.warpIds.join(", ")],
    ["모두의카풀 회원번호", hit.memberCode || "계정 없음"],
    ["이메일", hit.email],
    ["처리 시각", when],
  ];
  const lead = `신워프 회원이 모두의카풀에서 ${label}를 확인했어요. 모두의카풀 쪽 처리는 끝났어요. 워프에서도 이 회원을 같은 방식으로 처리해 주세요.`;
  const link = `${siteUrl()}/admin`;
  const subject = `[모두의카풀] 신워프 회원 ${label} · ${hit.warpIds[0]}`;
  const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀 · 신워프 회원 ${esc(label)}</p>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(lead)}</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.6;margin:0 0 20px">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#8B95A1;width:130px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`)
    .join("")}</table>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">관리자 화면 열기</a>
</div></div>`;
  const text = `${lead}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${link}`;
  await Promise.all(to.map((addr) => deliver({ kind: "warp-leave-admin", category: "transactional", to: addr, subject, html, text }).catch(() => false)));
}
