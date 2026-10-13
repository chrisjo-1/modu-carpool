import { CALL_COST, acceptCall, callDrivers, callStatus, callerReady, getCallRadiusKm, incomingCall, nearbyBand } from "@/lib/call";
import { contactLabel } from "@/lib/types";
import { PHOTO_REQUIRED, hasPhoto } from "@/lib/verify";
import { body, currentUserId, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 호출 반경·차감 크레딧·내 연락 방법 등록 여부. ?callId= 이면 받은 호출 한 건 */
export async function GET(req: Request) {
  const me = await currentUserId();
  const callId = new URL(req.url).searchParams.get("callId");
  try {
    await ensureSchema();
    if (callId) {
      if (!me) return needLogin();
      if (!isUuid(callId)) return json({ error: "잘못된 요청입니다." }, 400);
      const c = await incomingCall(me, callId);
      if (!c) return json({ error: "받은 호출을 찾을 수 없어요." }, 404);
      return json(c);
    }
    const ready = me ? await callerReady(me) : { ready: false, type: "" };
    const today = me ? await callStatus(me) : null;
    // 현재 위치 주변 운전자 수(구간만). lat·lng 가 있고 로그인한 경우에만 계산한다.
    const sp = new URL(req.url).searchParams;
    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    const hasPos = me && sp.get("lat") !== null && sp.get("lng") !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const band = me && hasPos ? await nearbyBand(me, lat, lng) : null;
    return json({ radiusKm: await getCallRadiusKm(), cost: CALL_COST, ready: ready.ready, contactType: contactLabel(ready.type), callsLeft: today?.left ?? null, callsLimit: today?.limit ?? null, band });
  } catch (e) {
    return fail(e);
  }
}

/** {postId}: CALL (크레딧 차감, 글 재등록, 주변 운전자 알림) · {action:"accept", callId}: 받은 호출 수락 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  try {
    await ensureSchema();
    if (!(await hasPhoto(me))) return json({ error: PHOTO_REQUIRED }, 403);
    if (b.action === "accept") {
      if (!isUuid(b.callId)) return json({ error: "잘못된 요청입니다." }, 400);
      const r = await acceptCall(me, String(b.callId));
      if ("error" in r) return json({ error: r.error }, 400);
      return json(r);
    }
    if (!isUuid(b.postId)) return json({ error: "호출할 글을 골라 주세요." }, 400);
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (b.lat == null || b.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json({ error: "현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요." }, 400);
    }
    const r = await callDrivers(me, String(b.postId), lat, lng);
    if ("error" in r) return json({ error: r.error }, 400);
    return json(r);
  } catch (e) {
    return fail(e);
  }
}
