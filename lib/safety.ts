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
/** 안심동행은 서로 얼굴을 확인할 수 있게 두 사람 모두 프로필 사진이 있어야 한다(2026-11-06 사용자 지시) */
export const SAFETY_PHOTO_ME = "안심동행은 서로 얼굴을 확인할 수 있게 두 분 모두 프로필 사진이 있어야 해요. 프로필 사진을 먼저 등록해야 신청할 수 있어요.";
/** 운전자(상대분): 사진 없이도 동의는 되지만, 동의한 뒤 대화방에서 계속 등록을 권한다 */
export const SAFETY_PHOTO_DRIVER = "얼굴이 보이는 프로필 사진을 등록해 주셔야 탑승자가 안심합니다.";

/** 운영 시간(한국 시각, 2026-11-06 사용자 지시: 밤 10시~아침 6시는 운영팀도 쉬어서 한시적으로 막음) */
export const SAFETY_OPEN_HOUR = 6;
export const SAFETY_CLOSE_HOUR = 22;
export const SAFETY_HOURS_TEXT = `안심동행은 오전 ${SAFETY_OPEN_HOUR}시부터 밤 ${SAFETY_CLOSE_HOUR - 12}시까지 운영해요.`;
export const SAFETY_NIGHT_TEXT = `밤 ${SAFETY_CLOSE_HOUR - 12}시부터 아침 ${SAFETY_OPEN_HOUR}시까지는 운영팀이 확인하지 못해 새로 시작할 수 없어요. 위급하면 바로 112에 연락해 주세요.`;
/** 지금(또는 t) 한국 시각이 운영 시간인지 */
export function safetyOpen(t = Date.now()) {
  const h = new Date(t + 9 * 3600_000).getUTCHours();
  return h >= SAFETY_OPEN_HOUR && h < SAFETY_CLOSE_HOUR;
}

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
