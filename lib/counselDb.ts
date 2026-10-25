import { CARE_TEXT, PRIVACY_TEXT, DEFAULT_CONFIG, LEVEL_LABEL, METHOD_LABEL, TOPIC_LABEL, cleanConfig, slotLabel, type CounselConfig, type Level, type Method, type Topic } from "./counsel";
import { deliver, siteUrl } from "./mail";
import { db } from "./server";

/** 마음 상담 서버 도우미: 시간 설정(settings.counsel_config), 찬 시각, 알림 메일 */
const KEY = "counsel_config";

export async function getCounselConfig(): Promise<CounselConfig> {
  const r = await db()`select value from settings where key = ${KEY}`;
  if (!r.length) return DEFAULT_CONFIG;
  try {
    return cleanConfig(JSON.parse(String(r[0].value)));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveCounselConfig(c: CounselConfig) {
  const v = JSON.stringify(c);
  await db()`insert into settings (key, value) values (${KEY}, ${v}) on conflict (key) do update set value = excluded.value`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);

type Booking = { topic: Topic; index: number; level: Level; crisis: boolean; slotAt: number; method: Method; contact: string; note: string; memberCode: string };

function card(title: string, rows: [string, string][], lead: string, button: string, link: string, warn = "") {
  return `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀 · ${esc(title)}</p>
${warn ? `<p style="margin:0 0 16px;padding:12px 14px;background:#FFF4EC;border-radius:12px;font-size:15px;line-height:1.6;color:#C2410C;font-weight:700">${esc(warn)}</p>` : ""}
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${esc(lead)}</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.6;margin:0 0 20px">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#8B95A1;width:96px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("")}</table>
<a href="${esc(link)}" style="display:inline-block;background:#2F6BFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:12px">${esc(button)}</a>
</div></div>`;
}

/** 관리자에게 새 예약 알림(ADMIN_EMAILS 전원). 위기 문항에 해당하면 제목·본문에 '긴급'. */
export async function notifyAdminsOfBooking(b: Booking) {
  const to = adminEmails();
  if (!to.length) {
    console.warn("[counsel] ADMIN_EMAILS 가 비어 있어 예약 알림 메일을 보내지 못했습니다.");
    return;
  }
  const when = slotLabel(b.slotAt);
  const subject = `[모두의카풀] ${b.crisis ? "[긴급] " : ""}마음 상담 예약 · ${when}`;
  const warn = b.crisis ? "위기 문항(스스로를 해치고 싶은 생각)에 '있음'으로 답했어요. 회원 화면에는 따로 안내하지 않으니 가능한 한 빨리 먼저 연락해 주세요." : "";
  const rows: [string, string][] = [
    ["희망 시간", when],
    ["상담 유형", TOPIC_LABEL[b.topic]],
    ["스트레스 지수", `${b.index}점 · ${LEVEL_LABEL[b.level]}`],
    ["연락 방법", `${METHOD_LABEL[b.method]}${b.contact ? ` · ${b.contact}` : ""}`],
    ["회원번호", b.memberCode || "-"],
    ["남긴 말", b.note || "-"],
  ];
  const link = `${siteUrl()}/admin`;
  const html = card("상담 예약", rows, "새 마음 상담 예약이 들어왔어요. 관리자 화면 '상담' 탭에서 확정하거나 연락해 주세요.", "관리자 화면 열기", link, warn);
  const text = `${warn ? `${warn}\n\n` : ""}새 마음 상담 예약\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${link}`;
  await Promise.all(to.map((addr) => deliver({ kind: "counsel-admin", category: "transactional", to: addr, subject, html, text }).catch(() => false)));
}

/** 예약한 회원에게 접수 확인 메일 */
export async function sendBookingReceipt(to: string, userId: string, b: Booking) {
  const when = slotLabel(b.slotAt);
  const subject = `[모두의카풀] 마음 상담 예약이 접수됐어요 · ${when}`;
  const rows: [string, string][] = [
    ["희망 시간", when],
    ["상담 유형", TOPIC_LABEL[b.topic]],
    ["연락 방법", METHOD_LABEL[b.method]],
  ];
  const lead = `예약을 접수했어요. 담당자가 확인한 뒤 남겨 주신 연락처로 연락드릴게요. ${CARE_TEXT} ${PRIVACY_TEXT} 예약은 내 정보 › 마음 상담에서 확인하거나 취소할 수 있어요.`;
  const html = card("마음 상담", rows, lead, "모두의카풀 바로가기", siteUrl());
  const text = `${lead}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${siteUrl()}`;
  await deliver({ kind: "counsel-receipt", category: "transactional", to, userId, subject, html, text }).catch(() => false);
}
