import { db } from "./server";

/** 홈 배너: 관리자 > 사이트에서 관리한다. settings 테이블의 한 값(JSON)으로 저장한다. */
export type Banner = {
  id: string;
  title: string;
  body: string;
  image: string;
  link: string;
  active: boolean;
  ad: boolean;
  start: string; // YYYY-MM-DD, 비우면 바로 시작
  end: string; // YYYY-MM-DD, 비우면 계속
};

export const BANNER_MAX = 5;
export const BANNER_KEY = "home_banners";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 링크: https/http 주소 또는 사이트 안 경로(/로 시작)만 허용. 비우면 링크 없음. */
export const safeLink = (v: string) => v === "" || /^https?:\/\/[^\s]+$/i.test(v) || (v.startsWith("/") && !v.startsWith("//") && !/\s/.test(v));

/** 관리자가 보낸 목록을 검사해 정리한다. */
export function cleanBanners(input: unknown): { ok: true; banners: Banner[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "잘못된 요청입니다." };
  if (input.length > BANNER_MAX) return { ok: false, error: `배너는 ${BANNER_MAX}개까지 만들 수 있어요.` };
  const out: Banner[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const s = (k: string, max: number) => (typeof raw?.[k] === "string" ? (raw[k] as string).trim().slice(0, max) : "");
    const title = s("title", 40);
    const body = s("body", 80);
    const image = s("image", 300);
    const link = s("link", 300);
    const start = s("start", 10);
    const end = s("end", 10);
    if (!title) return { ok: false, error: "배너 제목을 적어 주세요." };
    if (image && !/^https:\/\/[^\s]+$/i.test(image)) return { ok: false, error: `"${title}" 이미지는 https 주소로 적어 주세요.` };
    if (!safeLink(link)) return { ok: false, error: `"${title}" 링크는 https 주소나 / 로 시작하는 사이트 안 경로로 적어 주세요.` };
    if ((start && !DATE.test(start)) || (end && !DATE.test(end))) return { ok: false, error: `"${title}" 기간은 날짜로 적어 주세요.` };
    if (start && end && start > end) return { ok: false, error: `"${title}" 종료일이 시작일보다 빨라요.` };
    const id = s("id", 40) || Math.random().toString(36).slice(2, 10);
    out.push({ id, title, body, image, link, active: raw.active !== false, ad: raw.ad === true, start, end });
  }
  return { ok: true, banners: out };
}

/** 오늘(한국 시간) 날짜 YYYY-MM-DD */
export const todayKst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 저장된 배너 전체(관리자용). 없거나 오류면 빈 목록. */
export async function readBanners(): Promise<Banner[]> {
  try {
    const rows = await db()`select value from settings where key = ${BANNER_KEY}`;
    const parsed = JSON.parse(String(rows[0]?.value ?? "[]"));
    return Array.isArray(parsed) ? (parsed as Banner[]) : [];
  } catch {
    return [];
  }
}

/** 지금 보여 줄 배너: 켜져 있고 기간 안에 있는 것만 */
export async function activeBanners(): Promise<Banner[]> {
  const today = todayKst();
  return (await readBanners()).filter((b) => b.active && (!b.start || b.start <= today) && (!b.end || b.end >= today));
}
