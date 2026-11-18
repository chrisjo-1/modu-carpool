/**
 * 접속 경로 분류(2026-11-18). 화면이 보낸 정보(utm·주소의 표시·이전 페이지 주소·앱 안 화면 여부)로 한 가지 이름을 고른다.
 * 순서: utm_source → 우리 링크 표시(메일·문자) → 앱 안 화면(카카오톡 등) → 이전 페이지 주소 → 홈 화면 앱 → 직접.
 */
export type VisitHint = { utm?: string; mark?: string; ref?: string; inApp?: string; standalone?: boolean };

export const SOURCE_LABEL: Record<string, string> = {
  mail: "메일 링크", sms: "문자·카톡 링크", kakao: "카카오톡", naver: "네이버", google: "구글", daum: "다음", bing: "빙",
  instagram: "인스타그램", facebook: "페이스북", band: "밴드", youtube: "유튜브", threads: "스레드", x: "X(트위터)",
  share: "글 공유 링크", app: "앱(홈 화면)", direct: "직접 입력·즐겨찾기", other: "다른 사이트",
};

export function classifyVisit(h: VisitHint): string {
  const utm = (h.utm ?? "").trim().toLowerCase().slice(0, 40);
  if (utm) return `utm:${utm}`;
  const mark = h.mark ?? "";
  if (mark === "mail") return "mail";
  if (mark === "sms") return "sms";
  if (mark === "share") return "share";
  const inApp = (h.inApp ?? "").toLowerCase();
  if (inApp === "kakao") return "kakao";
  if (inApp === "instagram") return "instagram";
  if (inApp === "facebook") return "facebook";
  if (inApp === "band") return "band";
  const host = (h.ref ?? "").toLowerCase();
  if (host) {
    if (/(^|\.)moducarpool\.com$|vercel\.app$/.test(host)) return h.standalone ? "app" : "direct";
    if (host === "links.moducarpool.com" || /mail\.(naver|google|daum)|mail\./.test(host)) return "mail";
    if (/naver\./.test(host)) return "naver";
    if (/google\./.test(host)) return "google";
    if (/daum\.|kakao\.com/.test(host)) return host.includes("kakao") ? "kakao" : "daum";
    if (/bing\./.test(host)) return "bing";
    if (/instagram\./.test(host)) return "instagram";
    if (/facebook\.|fb\./.test(host)) return "facebook";
    if (/band\.us/.test(host)) return "band";
    if (/youtube\.|youtu\.be/.test(host)) return "youtube";
    if (/threads\./.test(host)) return "threads";
    if (/(^|\.)x\.com$|twitter\./.test(host)) return "x";
    return "other";
  }
  return h.standalone ? "app" : "direct";
}

export const sourceLabel = (s: string) => (s.startsWith("utm:") ? `캠페인: ${s.slice(4)}` : SOURCE_LABEL[s] ?? s);
