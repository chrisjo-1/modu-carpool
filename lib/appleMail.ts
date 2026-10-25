/**
 * 아이폰(애플) 메일 주소: 대량 메일이 닿지 않아 메일 발송 대상에서 빼고 문자로만 안내한다(사용자 지시 2026-10-25).
 * privaterelay.appleid.com 은 '이메일 가리기' 중계 주소로, 워프 앱에 등록된 발신 도메인 메일만 받아 우리 메일은 전달되지 않는다.
 */
export const APPLE_MAIL_DOMAINS = ["icloud.com", "me.com", "mac.com", "privaterelay.appleid.com"];

export function isAppleMail(email: string | null | undefined): boolean {
  const d = String(email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  return APPLE_MAIL_DOMAINS.includes(d);
}
