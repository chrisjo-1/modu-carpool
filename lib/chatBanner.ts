import { db } from "./server";
import { safeLink } from "./banners";
import { youtubeId } from "./youtube";

/**
 * 채팅 목록 아래 배너: 관리자 > 사이트 '채팅 배너'에서 한 칸으로 관리한다. settings 한 값(JSON).
 * kind image: 이미지(누르면 링크) · kind video: 유튜브 영상을 그 자리에서 재생(video = 영상 id 11자)
 */
export type ChatBanner = {
  kind: "image" | "video";
  video: string;
  title: string;
  /** 설명(두 줄까지 보인다) */
  desc: string;
  image: string;
  link: string;
  active: boolean;
  /** 광고 표시(켜면 '광고' 글자를 함께 보여 준다) */
  ad: boolean;
};

export const CHAT_BANNER_KEY = "chat_banner";

/** 관리자가 보낸 값을 검사해 정리한다. 이미지는 관리자 업로드 주소만 받는다. */
export function cleanChatBanner(raw: unknown): { ok: true; banner: ChatBanner } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof r[k] === "string" ? (r[k] as string).trim().slice(0, max) : "");
  const title = s("title", 40);
  const desc = s("desc", 120);
  const image = s("image", 300);
  const link = s("link", 300);
  const kind = r.kind === "video" ? "video" : "image";
  if (kind === "video") {
    const video = youtubeId(s("video", 300));
    if (!video) return { ok: false, error: "유튜브 영상 주소를 확인해 주세요(예: https://youtu.be/…)." };
    return { ok: true, banner: { kind, video, title, desc, image: "", link: "", active: r.active !== false, ad: r.ad === true } };
  }
  if (image && !/^\/api\/mail\/image\/[0-9a-f-]{36}$/i.test(image)) return { ok: false, error: "채팅 배너 이미지를 다시 올려 주세요." };
  if (!safeLink(link)) return { ok: false, error: "링크는 https 주소나 / 로 시작하는 사이트 안 경로로 적어 주세요." };
  return { ok: true, banner: { kind, video: "", title, desc, image, link, active: r.active !== false, ad: r.ad === true } };
}

/** 저장된 채팅 배너(없거나 오류면 null) */
export async function readChatBanner(): Promise<ChatBanner | null> {
  try {
    const rows = await db()`select value from settings where key = ${CHAT_BANNER_KEY}`;
    if (!rows.length) return null;
    const parsed = JSON.parse(String(rows[0].value));
    if (!parsed || typeof parsed !== "object") return null;
    const c = cleanChatBanner(parsed);
    return c.ok ? c.banner : null;
  } catch {
    return null;
  }
}
