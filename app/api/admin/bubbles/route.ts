import { BUBBLES, BUBBLE_MAX, cleanBubbleTexts } from "@/lib/bubbleDefs";
import { getBubbleTexts, saveBubbleTexts } from "@/lib/bubbles";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 말풍선 목록과 현재 문구 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    return json({ items: BUBBLES, texts: await getBubbleTexts(), max: BUBBLE_MAX });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 말풍선 문구 저장. 빈 칸은 기본 문구로 되돌린다. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const src = (b.texts ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    const v = String(src[k] ?? "").trim();
    if (v.length > BUBBLE_MAX) return json({ error: `말풍선 문구는 ${BUBBLE_MAX}자 이내로 적어 주세요.` }, 400);
  }
  try {
    await ensureSchema();
    const saved = await saveBubbleTexts(cleanBubbleTexts(src));
    return json({ texts: saved });
  } catch (e) {
    return fail(e);
  }
}
