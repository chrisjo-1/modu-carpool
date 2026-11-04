import { logOps } from "@/lib/opsLog";
import { db, ensureSchema, fail, hasDb, isAdmin, isUuid, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 관리자: 카풀의 운전자 연락처 보기. 누를 때마다 운영 일지에 남는다(목록 새로고침으로는 보이지 않음). */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const requestId = new URL(req.url).searchParams.get("req") ?? "";
  if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const rows = await db()`select phone from ride_contacts where request_id = ${requestId}`;
    if (!rows.length) return json({ error: "등록된 운전자 연락처가 없어요(카풀 종료 또는 삭제됨)." }, 404);
    await logOps("admin", "운전자 연락처 열람", `요청 ${requestId.slice(0, 8)} · 안전 확인`);
    return json({ phone: String(rows[0].phone) });
  } catch (e) {
    return fail(e);
  }
}
