import { saveLocation } from "@/lib/call";
import { body, currentUserId, ensureSchema, fail, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 로그인한 회원이 앱을 열 때 현재 위치를 기록한다(CALL 대상 찾기용).
 * 위치는 화면에 보이지 않고, 30분이 지나면 CALL 대상에서 빠진다.
 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (b.lat == null || b.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: "위치 정보가 올바르지 않아요." }, 400);
  }
  try {
    await ensureSchema();
    await saveLocation(me, lat, lng);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
