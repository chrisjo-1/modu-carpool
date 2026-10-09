import { NextResponse, type NextRequest } from "next/server";

/**
 * 다른 사이트에서 회원 쿠키를 실어 API를 바꾸려는 요청(CSRF)을 막는다.
 * 쓰기 요청(POST·PUT·PATCH·DELETE)은 Origin(없으면 Referer)이 이 사이트여야 한다.
 */
export function middleware(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return NextResponse.next();
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

export const config = { matcher: "/api/:path*" };
