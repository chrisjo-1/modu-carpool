import { BUBBLES, cleanBubbleTexts } from "./bubbleDefs";
import { db } from "./server";

/** 관리자가 바꾼 말풍선 문구(한국어). 없으면 빈 객체 — 화면은 기본 문구를 쓴다. */
export async function getBubbleTexts(): Promise<Record<string, string>> {
  try {
    const rows = await db()`select value from settings where key = 'bubble_texts'`;
    return cleanBubbleTexts(JSON.parse(String(rows[0]?.value ?? "{}")));
  } catch {
    return {};
  }
}

export async function saveBubbleTexts(texts: Record<string, string>) {
  const clean = cleanBubbleTexts(texts);
  await db()`insert into settings (key, value) values ('bubble_texts', ${JSON.stringify(clean)})
    on conflict (key) do update set value = excluded.value`;
  return clean;
}

export const BUBBLE_IDS = BUBBLES.map((b) => b.id);
