/**
 * 유튜브 주소(또는 11자리 영상 id)에서 영상 id를 꺼낸다. 주소 형식: watch?v=, youtu.be/, shorts/, embed/, live/.
 * 알아볼 수 없으면 빈 문자열. 화면(클라이언트)과 서버가 함께 쓰는 순수 함수라 DB 코드를 넣지 않는다.
 */
export function youtubeId(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return "";
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (!["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) return "";
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] ?? "";
  else if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
  else {
    const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
    id = m ? m[2] : "";
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
}
