/**
 * 방문 기록 보내기(화면 전용, 2026-11-18). 첫 화면을 막지 않게 2초 뒤·한가할 때 한 번, 로그인하면 한 번 더(회원 연결).
 * 기기 번호는 무작위로 만들어 이 기기 localStorage에만 둔다(이름·IP 없음).
 */
// 앱이 주소의 표시(?reset= 등)를 지우기 전에 첫 주소를 기억해 둔다
const firstSearch = typeof window !== "undefined" ? window.location.search : "";
const firstPath = typeof window !== "undefined" ? window.location.pathname : "";
const firstRef = typeof document !== "undefined" ? document.referrer : "";

function visitorId(): { vid: string; isNew: boolean } {
  try {
    const old = localStorage.getItem("modu.vid");
    if (old && /^[a-z0-9]{12,40}$/i.test(old)) return { vid: old, isNew: false };
    const v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 20);
    localStorage.setItem("modu.vid", v);
    return { vid: v, isNew: true };
  } catch {
    return { vid: "", isNew: false };
  }
}

function hints() {
  const q = new URLSearchParams(firstSearch);
  const has = (k: string) => q.has(k);
  // 문자·카톡 회원별 링크(/s/코드)·공용 링크(/credit)는 next=credit로 들어온다
  const mark = q.get("next") === "credit" ? "sms"
    : ["reset", "verify", "leave", "unsub", "legacy", "emailchange", "withdraw", "counsel", "notice"].some(has) ? "mail"
    : has("p") || firstPath.startsWith("/post/") ? "share" : "";
  const landing = mark ? [...q.keys()].find((k) => k !== "next" && k !== "utm_source" && k !== "utm_medium" && k !== "utm_campaign") ?? mark : firstPath === "/" ? "" : firstPath.slice(0, 40);
  const ua = navigator.userAgent;
  const inApp = /KAKAOTALK/i.test(ua) ? "kakao" : /Instagram/i.test(ua) ? "instagram" : /FBAN|FBAV/i.test(ua) ? "facebook" : /BAND\//i.test(ua) ? "band" : "";
  let ref = "";
  try { ref = firstRef ? new URL(firstRef).hostname : ""; } catch { /* 무시 */ }
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return { utm: q.get("utm_source") ?? "", mark, landing, inApp, ref, standalone, mobile };
}

export function sendVisit(loggedIn: boolean) {
  if (typeof window === "undefined" || (navigator as unknown as { webdriver?: boolean }).webdriver) return;
  const key = loggedIn ? "modu.visit.u" : "modu.visit";
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* 저장이 막혀도 보낸다 */
  }
  const go = () => {
    const { vid, isNew } = visitorId();
    if (!vid) return;
    const data = JSON.stringify({ vid, isNew: isNew && !loggedIn, ...hints() });
    fetch("/api/visit", { method: "POST", headers: { "content-type": "application/json" }, body: data, keepalive: true }).catch(() => {});
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  setTimeout(() => (idle ? idle(go) : go()), 2000);
}
