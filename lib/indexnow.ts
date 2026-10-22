import { SITE_URL } from "./site";

/**
 * IndexNow: 새 글·새 페이지 주소를 검색엔진(네이버·빙 등 참여 엔진)에 바로 알린다.
 * 키는 공개 값이다(사이트의 /indexnow.txt 로 누구나 볼 수 있어야 검증된다). 환경변수 INDEXNOW_KEY로 바꿀 수 있다.
 * 구글은 IndexNow를 쓰지 않으므로 사이트맵과 서치 콘솔로 알린다.
 */
export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "8c351e2049f60a1a26931fe3fc6f3187";

export async function pingIndexNow(paths: string[]): Promise<{ ok: boolean; status: number; count: number }> {
  const urlList = [...new Set(paths.map((p) => (p.startsWith("http") ? p : `${SITE_URL}${p.startsWith("/") ? "" : "/"}${p}`)))].slice(0, 10000);
  // 로컬·미리보기에서는 보내지 않는다(운영 주소만).
  if (!urlList.length || !process.env.VERCEL || process.env.VERCEL_ENV !== "production") return { ok: false, status: 0, count: 0 };
  try {
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/indexnow.txt`, urlList }),
    });
    return { ok: r.status === 200 || r.status === 202, status: r.status, count: urlList.length };
  } catch {
    return { ok: false, status: -1, count: urlList.length };
  }
}
