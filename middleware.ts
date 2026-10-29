import { NextResponse, type NextRequest } from "next/server";
import { isBlockedAgent } from "@/lib/botBlock";

/**
 * 1) 주소를 AI 도구·복제 도구에 넣어 화면·API를 가져가는 접근을 막는다(`lib/botBlock.ts`).
 *    검색엔진·링크 미리보기는 통과. Vercel 예약 실행(/api/cron)·Resend 웹훅은 검사하지 않는다.
 * 2) 다른 사이트에서 회원 쿠키를 실어 API를 바꾸려는 요청(CSRF)을 막는다.
 *    쓰기 요청(POST·PUT·PATCH·DELETE)은 Origin(없으면 Referer)이 이 사이트여야 한다.
 */
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const machine = path.startsWith("/api/cron/") || path === "/api/mail/webhook";
  if (!machine && isBlockedAgent(req.headers.get("user-agent"))) {
    return new NextResponse("Forbidden", { status: 403, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  if (!path.startsWith("/api/")) return NextResponse.next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return NextResponse.next();
  // Resend 웹훅은 다른 서버가 보내므로 Origin이 없다. 대신 그 안에서 서명(svix)을 확인한다.
  if (path === "/api/mail/webhook") return NextResponse.next();
  const from = req.headers.get("origin") ?? req.headers.get("referer");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    ok = !!from && !!host && new URL(from).host === host;
  } catch {
    ok = false;
  }
  if (!ok) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 403 });
  return NextResponse.next();
}

// 화면(HTML)과 API에만 건다. 그림·글꼴·robots.txt 같은 파일과 _next 정적 파일은 검사하지 않는다(요청마다 비용이 들지 않게).
export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|gif|svg|ico|txt|xml|json|js|css|map|woff2?|webmanifest|mp3)$).*)"],
};
