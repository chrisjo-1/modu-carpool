import { readSeatConfig } from "@/lib/seatConfig";
import { isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 앉아가기 열림 여부와 시범 노선(공개). visible은 하단 '지하철' 탭을 보여 줄지 정한다(관리자는 항상 보임). */
export async function GET() {
  const c = await readSeatConfig();
  const visible = c.enabled || (await isAdmin());
  return json({ enabled: c.enabled, visible, pilot: c.pilot });
}
