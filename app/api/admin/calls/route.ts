import { listCalls } from "@/lib/call";
import { ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 관리자: 최근 CALL 이력(호출자, 경로, 반경, 알림·수락 인원) */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    return json({ calls: await listCalls({ limit: 200 }) });
  } catch (e) {
    return fail(e);
  }
}
