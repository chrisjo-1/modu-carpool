import { callerReady } from "@/lib/call";
import { TAXI_DAILY_LIMIT, acceptTaxiCall, createTaxiCall, incomingTaxiCall, taxiStatus } from "@/lib/taxicall";
import { contactLabel } from "@/lib/types";
import { PHOTO_REQUIRED, hasPhoto } from "@/lib/verify";
import { body, currentUserId, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** ?callId= 받은 택시동승 호출 한 건 · 그 밖에는 내 상태(오늘 남은 횟수, 연락 방법 등록 여부) */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const callId = new URL(req.url).searchParams.get("callId");
  try {
    await ensureSchema();
    if (callId) {
      if (!isUuid(callId)) return json({ error: "잘못된 요청입니다." }, 400);
      const c = await incomingTaxiCall(me, callId);
      if (!c) return json({ error: "받은 호출을 찾을 수 없어요." }, 404);
      return json(c);
    }
    const ready = await callerReady(me);
    const st = await taxiStatus(me);
    return json({ ready: ready.ready, contactType: contactLabel(ready.type), left: st.left, limit: TAXI_DAILY_LIMIT });
  } catch (e) {
    return fail(e);
  }
}

/** 호출 보내기 {origin, dest, departAt, note, lat, lng} · 받은 호출 수락 {action:"accept", callId} */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  try {
    await ensureSchema();
    if (!(await hasPhoto(me))) return json({ error: PHOTO_REQUIRED }, 403);
    if (b.action === "accept") {
      if (!isUuid(b.callId)) return json({ error: "잘못된 요청입니다." }, 400);
      const r = await acceptTaxiCall(me, String(b.callId));
      if ("error" in r) return json({ error: r.error }, 400);
      return json(r);
    }
    if (b.lat == null || b.lng == null) return json({ error: "현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요." }, 400);
    const r = await createTaxiCall(me, {
      origin: String(b.origin ?? ""),
      dest: String(b.dest ?? ""),
      departAt: Number(b.departAt),
      note: String(b.note ?? ""),
      lat: Number(b.lat),
      lng: Number(b.lng),
    });
    if ("error" in r) return json({ error: r.error }, 400);
    return json(r);
  } catch (e) {
    return fail(e);
  }
}
