/**
 * 주소를 AI 도구·복제 도구에 넣어 사이트를 통째로 가져가는 접근을 막는다(2026-10-29 사용자 지시).
 * 검색엔진(구글·네이버·다음·빙)과 링크 미리보기(카카오톡·페이스북·슬랙 등)는 막지 않는다.
 * 사람이 쓰는 브라우저 화면을 보고 따라 만드는 것까지는 막을 수 없다.
 */

/** AI가 사람 대신 주소를 열거나(…-User) 학습용으로 모으는 수집기 */
export const AI_AGENTS = [
  "GPTBot", "ChatGPT-User", "ChatGPT Agent", "ClaudeBot", "Claude-User", "Claude-Web", "anthropic-ai",
  "Perplexity-User", "MistralAI-User", "CCBot", "Bytespider", "Amazonbot", "meta-externalagent", "meta-externalfetcher",
  "FacebookBot", "cohere-ai", "cohere-training-data-crawler", "Diffbot", "YouBot", "DuckAssistBot", "AI2Bot", "Timpibot",
  "ImagesiftBot", "omgili", "PanguBot", "Kangaroo Bot", "Google-CloudVertexBot", "Novellum", "img2dataset", "Webzio",
];

/** 사이트 복제·대량 수집 도구, 자동 브라우저, 코드로 여는 요청 */
const TOOLS = [
  "Firecrawl", "Jina", "Scrapy", "HTTrack", "SiteSucker", "WebCopier", "WebZIP", "Teleport", "Offline Explorer", "Website Ripper",
  "wget", "curl/", "python-requests", "python-urllib", "python-httpx", "aiohttp", "httpx", "Go-http-client", "node-fetch", "axios/",
  "undici", "okhttp", "Java/", "libwww-perl", "HeadlessChrome", "PhantomJS", "Puppeteer", "Playwright", "Selenium", "Screaming Frog",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const BLOCK = new RegExp(`(${[...AI_AGENTS, ...TOOLS].map(escape).join("|")})`, "i");

/** 막을 접근이면 true. 정체를 밝히지 않는(빈) 접근도 막는다. */
export function isBlockedAgent(ua: string | null): boolean {
  if (!ua || ua.trim().length < 8) return true;
  return BLOCK.test(ua);
}
