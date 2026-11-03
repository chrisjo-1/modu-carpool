import { db, ensureSchema } from "./server";

/**
 * 관리자 운영 일지(ops_log)에 한 줄 남긴다. category: admin(자동 조치) · memo(관리자 메모).
 * 기록이 실패해도 본래 작업은 그대로 끝낸다.
 */
export async function logOps(category: "admin" | "memo", action: string, detail = "", actor = "관리자") {
  try {
    await ensureSchema();
    await db()`insert into ops_log (category, actor, action, detail) values (${category}, ${actor.slice(0, 40)}, ${action.slice(0, 120)}, ${detail.slice(0, 1000)})`;
  } catch (e) {
    console.error("[ops-log]", e);
  }
}
