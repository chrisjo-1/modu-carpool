/**
 * 안심동행(2026-11-04 '안전지킴'으로 시작, 2026-11-06 이름 변경·탑승 체크·예상 도착 시각 추가):
 * 탑승자가 [뒷자리에 탔어요]와 예상 도착 시각을 정하면, 이동 중 주기적으로 "불편함은 없으신가요?"를 묻고,
 * 아니오이거나 3분 동안 응답이 없으면 관리자 화면에 빨간색으로 올린다. 관리자가 미리 받아 둔 번호로 직접 연락한다.
 * 이 기능은 완전한 안전을 보장하지 않는다는 점을 신청 전에 반드시 안내한다.
 */
export const SAFETY_INTERVAL_MIN = 10; // 주기 확인 간격(분)
export const SAFETY_OVERDUE_MIN = 3; // 확인 질문 뒤 이 시간 안에 답이 없으면 관리자 화면에서 '무응답'

export const SAFETY_LATE_MIN = 10; // 예상 도착 시각에서 이만큼 지나도 [도착했어요]가 없으면 '도착 지연'
export const SAFETY_NAME = "안심동행";

export const SAFETY_DISCLAIMER = "안심동행은 보조 장치이며 안전을 완전히 보장하지 않아요. 위급한 상황에는 먼저 112에 연락해 주세요.";
/** 도착할 때까지 운영팀이 함께 지켜본다는 안내(의무가 아니라 서로 조심하자는 뜻) */
export const SAFETY_WATCH_TEXT = "도착할 때까지 운영팀이 함께 지켜보고 있어요. 확인 응답과 긴급 신호는 바로 운영팀 화면에 올라가요.";
/** 운전자(상대분)에게 보이는 동의 문구 */
export const SAFETY_DRIVER_CONSENT = "여성 회원이 탑승하면 도착할 때까지 운영팀이 함께 지켜보고 있어요. 이에 동의하시나요?";

/** 전화번호 정리: 숫자만 남기고 휴대폰 번호 형식인지 확인한다. 형식이 아니면 null. */
export function normPhone(v: unknown): string | null {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}
