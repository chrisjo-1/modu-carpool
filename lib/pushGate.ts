/**
 * 알림 필수(2026-11-06 사용자 지시): 카풀 신청·CALL을 보내기 전에 이 기기 알림이 꺼져 있으면 먼저 켜게 한다.
 * App이 로그인 회원의 알림 상태를 넣어 두고, 보내는 버튼은 needPush()로 묻는다(true면 App이 알림 켜기 창을 띄움).
 * 지원하지 않는 브라우저·설치 전 아이폰은 막지 않는다(켤 방법이 없어 아예 못 쓰게 되므로) — 안내 카드만 보인다.
 */
let cur = "loading";
export function setPushGateState(s: string) {
  cur = s;
}
export function needPush(): boolean {
  if (cur !== "off" && cur !== "denied") return false;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("modu:need-push"));
  return true;
}
