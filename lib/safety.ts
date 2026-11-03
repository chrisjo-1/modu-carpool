/**
 * 안전지킴(2026-11-04): 카풀 이동 중 탑승자에게 주기적으로 "불편함은 없으신가요?"를 묻고,
 * 아니오이거나 3분 동안 응답이 없으면 관리자 화면에 빨간색으로 올린다. 관리자가 미리 받아 둔 번호로 직접 연락한다.
 * 이 기능은 완전한 안전을 보장하지 않는다는 점을 신청 전에 반드시 안내한다.
 */
export const SAFETY_INTERVAL_MIN = 10; // 주기 확인 간격(분)
export const SAFETY_OVERDUE_MIN = 3; // 확인 질문 뒤 이 시간 안에 답이 없으면 관리자 화면에서 '무응답'

export const SAFETY_DISCLAIMER = "안전지킴은 보조 장치이며 안전을 완전히 보장하지 않아요. 위급한 상황에는 먼저 112에 연락해 주세요.";

/** 전화번호 정리: 숫자만 남기고 휴대폰 번호 형식인지 확인한다. 형식이 아니면 null. */
export function normPhone(v: unknown): string | null {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}
