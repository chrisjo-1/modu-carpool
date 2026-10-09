import { getKeywords } from "@/lib/keywords";
import { ensureSchema, fail, hasDb, json } from "@/lib/server";
import { DEFAULT_KEYWORDS } from "@/lib/keywords";

export const dynamic = "force-dynamic";

/** 글쓰기 화면에서 고를 키워드 목록 */
export async function GET() {
  if (!hasDb()) return json({ keywords: DEFAULT_KEYWORDS });
  try {
    await ensureSchema();
    return json({ keywords: await getKeywords() });
  } catch (e) {
    return fail(e);
  }
}
