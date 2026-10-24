import { safeLink, todayKst } from "./banners";
import { db } from "./server";

/**
 * 앱 접속 팝업: 관리자 > 사이트에서 관리한다. settings 한 값(JSON)에 목록과 바뀌는 간격을 함께 둔다.
 * 2개 이상 켜져 있으면 interval초마다 다음 팝업으로 넘어간다.
 */
export type Popup = {
  id: string;
  title: string; // 이미지 대체 글자·관리용 이름
  image: string; // 관리자에서 올린 이미지 /api/mail/image/<uuid> (사이트 보안 정책상 외부 이미지 주소는 앱에서 막힌다)
  link: string; // https 주소 또는 / 로 시작하는 사이트 안 경로, 비우면 링크 없음
  active: boolean;
  start: string; // YYYY-MM-DD
  end: string;
};
export type PopupConfig = { items: Popup[]; interval: number };

export const POPUP_MAX = 5;
export const POPUP_KEY = "launch_popups";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMG = /^\/api\/mail\/image\/[0-9a-f-]{36}$/i;

export function cleanPopups(input: unknown, interval: unknown): { ok: true; config: PopupConfig } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "잘못된 요청입니다." };
  if (input.length > POPUP_MAX) return { ok: false, error: `팝업은 ${POPUP_MAX}개까지 만들 수 있어요.` };
  const items: Popup[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const s = (k: string, max: number) => (typeof raw?.[k] === "string" ? (raw[k] as string).trim().slice(0, max) : "");
    const title = s("title", 40);
    const image = s("image", 300);
    const link = s("link", 300);
    const start = s("start", 10);
    const end = s("end", 10);
    if (!title) return { ok: false, error: "팝업 이름(제목)을 적어 주세요." };
    if (!IMG.test(image)) return { ok: false, error: `"${title}" 이미지를 올려 주세요.` };
    if (!safeLink(link)) return { ok: false, error: `"${title}" 링크는 https 주소나 / 로 시작하는 사이트 안 경로로 적어 주세요.` };
    if ((start && !DATE.test(start)) || (end && !DATE.test(end))) return { ok: false, error: `"${title}" 기간은 날짜로 적어 주세요.` };
    if (start && end && start > end) return { ok: false, error: `"${title}" 종료일이 시작일보다 빨라요.` };
    items.push({ id: s("id", 40) || Math.random().toString(36).slice(2, 10), title, image, link, active: raw.active !== false, start, end });
  }
  const sec = Math.round(Number(interval));
  return { ok: true, config: { items, interval: Number.isFinite(sec) && sec >= 2 && sec <= 30 ? sec : 4 } };
}

export async function readPopups(): Promise<PopupConfig> {
  try {
    const rows = await db()`select value from settings where key = ${POPUP_KEY}`;
    const v = JSON.parse(String(rows[0]?.value ?? "{}"));
    return { items: Array.isArray(v.items) ? (v.items as Popup[]) : [], interval: Number(v.interval) || 4 };
  } catch {
    return { items: [], interval: 4 };
  }
}

/** 지금 보여 줄 팝업: 켜져 있고 기간 안에 있는 것만 */
export async function activePopups(): Promise<PopupConfig> {
  const today = todayKst();
  const c = await readPopups();
  return { interval: c.interval, items: c.items.filter((p) => p.active && (!p.start || p.start <= today) && (!p.end || p.end >= today)) };
}
