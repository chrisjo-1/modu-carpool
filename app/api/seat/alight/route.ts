import { currentUserId, fail, json, needLogin } from "@/lib/server";
import { offAlightAlert, seatDbReady } from "@/lib/seatDb";

export const dynamic = "force-dynamic";

/** 오늘 하차 알림 끄기 */
export async function DELETE() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    await offAlightAlert(uid);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
