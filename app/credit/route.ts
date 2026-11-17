import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** 공용 크레딧 이관 링크(2026-11-17): 단체 카톡방 등 회원별 링크를 못 쓸 때. 로그인 뒤 크레딧 이관 신청 창을 연다. */
export function GET() {
  return NextResponse.redirect(`${SITE_URL}/?next=credit`, 302);
}
