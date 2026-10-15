import { getBubbleTexts } from "@/lib/bubbles";
import { json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 말풍선 문구(관리자가 바꾼 것만). 로그인 없이 읽을 수 있다. */
export async function GET() {
  return json({ texts: await getBubbleTexts() });
}
