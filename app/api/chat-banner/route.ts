import { readChatBanner } from "@/lib/chatBanner";
import { ensureSchema, hasDb, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 채팅 목록 아래 배너(켜져 있고 이미지가 있을 때만). 로그인하지 않아도 볼 수 있다. */
export async function GET() {
  if (!hasDb()) return json({ banner: null });
  try {
    await ensureSchema();
    const b = await readChatBanner();
    if (!b || !b.active) return json({ banner: null });
    if (b.kind === "video") return b.video ? json({ banner: { kind: "video", video: b.video, title: b.title, ad: b.ad } }) : json({ banner: null });
    if (!b.image) return json({ banner: null });
    return json({ banner: { kind: "image", title: b.title, image: b.image, link: b.link, ad: b.ad } });
  } catch {
    return json({ banner: null });
  }
}
