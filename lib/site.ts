/** 대표 주소. 메일 링크·canonical·sitemap·OG가 모두 이 값을 쓴다. 도메인을 연결하면 Vercel 환경변수 SITE_URL만 바꾸면 된다. */
export const SITE_URL = (process.env.SITE_URL || "https://moducarpool.com").replace(/\/$/, "");
