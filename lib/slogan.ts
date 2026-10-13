import { db } from "./server";

/** 홈 상단 주제목(부제). 관리자 > 사이트에서 바꿀 수 있다. */
export const DEFAULT_SLOGAN = "같은 방향, 같이 가요";
export const SLOGAN_MAX = 30;

/** 저장된 주제목. 없거나 DB 오류면 기본값. */
export async function getSlogan(): Promise<string> {
  try {
    const rows = await db()`select value from settings where key = 'site_slogan'`;
    const v = String(rows[0]?.value ?? "").trim();
    return v || DEFAULT_SLOGAN;
  } catch {
    return DEFAULT_SLOGAN;
  }
}
