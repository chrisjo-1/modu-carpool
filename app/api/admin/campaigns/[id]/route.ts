import { db, ensureSchema, fail, hasDb, isAdmin, isUuid, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 캠페인 취소. 이미 발송된 메일은 되돌리지 않고, 아직 나가지 않은 대상만 멈춘다. */
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "잘못된 캠페인입니다." }, 400);
  try {
    await ensureSchema();
    await db()`update mail_campaigns set status = 'cancelled', finished_at = now() where id = ${id} and status in ('draft','sending')`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
