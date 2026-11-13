import { SITE_URL } from "@/lib/site";
import { costText, openPosts, roleWord, routeTitle, whenText } from "@/lib/seoArea";

// 네이버 서치어드바이저 RSS 제출용(2026-11-13). 최근 공개 카풀 글 50건 + 안내 페이지. 10분마다 다시 만든다.
export const revalidate = 600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const posts = await openPosts({ limit: 50 }).catch(() => []);
  const fixed = new Date("2026-11-13T00:00:00+09:00").toUTCString();
  const pages = [
    { url: "/carpool", title: "지역별 출퇴근 카풀", desc: "지역별로 지금 모집 중인 출퇴근 카풀을 모았어요." },
    { url: "/subway", title: "지하철 앉아가기 — 출근길 앉을 칸 안내", desc: "역·방향·시간별 혼잡도로 앉을 확률이 높은 칸을 알려 드려요." },
    { url: "/faq", title: "자주 묻는 질문 — 카풀 이용·카풀 규제", desc: "모두의카풀 이용 방법과 출퇴근 카풀 규제를 정리했어요." },
    { url: "/warp", title: "워프 회원 모두의카풀 이전 안내", desc: "워프(풀럭) 회원이 모두의카풀로 옮겨 오는 방법을 안내해요." },
  ];
  const items = [
    ...posts.map((p) => {
      const title = `${routeTitle(p)} ${p.regular ? "출퇴근 정기카풀" : "카풀"} · ${whenText(p)}`;
      const desc = `${roleWord(p.role)} · ${p.origin} → ${p.dest} · ${whenText(p)} · ${costText(p)}`;
      return `<item><title>${esc(title)}</title><link>${SITE_URL}/post/${p.id}</link><guid isPermaLink="true">${SITE_URL}/post/${p.id}</guid><description>${esc(desc)}</description><pubDate>${new Date(p.createdAt).toUTCString()}</pubDate></item>`;
    }),
    ...pages.map((p) => `<item><title>${esc(p.title)}</title><link>${SITE_URL}${p.url}</link><guid isPermaLink="true">${SITE_URL}${p.url}</guid><description>${esc(p.desc)}</description><pubDate>${fixed}</pubDate></item>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>모두의카풀 — 출퇴근 카풀·지하철 앉아가기</title>
<link>${SITE_URL}/</link>
<description>같은 방향 이웃과 함께 가는 출퇴근 카풀. 무료 운행·실비 분담.</description>
<language>ko</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join("\n")}
</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=600" } });
}
