import { CALL_COST, callDrivers, getCallRadiusKm } from "@/lib/call";
import { body, currentUserId, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 호출 반경(km)과 차감 크레딧 안내용 */
export async function GET() {
  try {
    await ensureSchema();
    return json({ radiusKm: await getCallRadiusKm(), cost: CALL_COST });
  } catch (e) {
    return fail(e);
  }
}

/** {postId}: 1,000 크레딧을 쓰고, 내 글을 지금 시간으로 다시 올린 뒤 주변 운전자에게 알림 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.postId)) return json({ error: "호출할 글을 골라 주세요." }, 400);
  try {
    await ensureSchema();
    const r = await callDrivers(me, String(b.postId));
    if ("error" in r) return json({ error: r.error }, 400);
    return json(r);
  } catch (e) {
    return fail(e);
  }
}
