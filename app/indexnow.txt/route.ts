import { INDEXNOW_KEY } from "@/lib/indexnow";

/** IndexNow 키 확인용 파일(검색엔진이 읽는다). */
export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
