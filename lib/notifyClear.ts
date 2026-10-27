/**
 * 휴대폰 알림창에 남은 우리 앱 알림을 닫는다. 안드로이드(삼성 등)는 남은 알림 수를 앱 아이콘 숫자로 보여 주므로,
 * 앱 안에서 대화를 읽어도 알림이 남아 있으면 아이콘의 '1'이 사라지지 않는다.
 * match: 알림 tag(예: chat-<신청ID>, req-<글ID>)를 받아 닫을지 정한다. 지원하지 않는 브라우저에서는 아무 일도 하지 않는다.
 */
export async function clearNotifications(match: (tag: string) => boolean) {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.getNotifications) return;
    const list = await reg.getNotifications();
    let left = 0;
    for (const n of list) {
      if (match(n.tag || "")) n.close();
      else left++;
    }
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    if (!left) await nav.clearAppBadge?.();
  } catch {
    /* 무시 */
  }
}
