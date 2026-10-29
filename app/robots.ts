import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { AI_AGENTS } from "@/lib/botBlock";

// AI 학습·AI 대신 열기 수집기는 사이트 전체 금지(서버에서도 middleware가 막는다). 검색엔진은 그대로 허용.
// Google-Extended·Applebot-Extended는 접속 이름이 아니라 robots.txt에서만 쓰는 이름이다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...AI_AGENTS, "Google-Extended", "Applebot-Extended"], disallow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
