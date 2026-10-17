import { readSeatConfig } from "@/lib/seatConfig";
import { json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 앉아가기 열림 여부와 시범 노선(공개). 지하철 탭을 열 때만 부른다. */
export async function GET() {
  const c = await readSeatConfig();
  return json({ enabled: c.enabled, pilot: c.pilot });
}
