import { db } from "./server";

/** 다시 올리기 버튼·하루 전 알림: 관리자가 '정책 적용'을 눌러야 가동한다(settings repost_on = '1'). */
export async function repostOn(): Promise<boolean> {
  try {
    const r = await db()`select value from settings where key = 'repost_on'`;
    return r[0]?.value === "1";
  } catch {
    return false;
  }
}
