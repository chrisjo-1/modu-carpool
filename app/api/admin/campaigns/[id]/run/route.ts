import { runCampaignBatch } from "@/lib/campaignRun";
import { body, fail, hasDb, isAdmin, isUuid, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 캠페인 발송 한 배치. 클라이언트가 remaining 0이 될 때까지 반복 호출한다(실제 발송은 lib/campaignRun). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "잘못된 캠페인입니다." }, 400);
  const b = await body(req);
  const limit = Math.min(Math.max(Number(b.limit) || 50, 1), 200);
  try {
    const r = await runCampaignBatch(id, limit);
    if (!r.ok) return json({ error: r.error }, r.status);
    return json(r);
  } catch (e) {
    return fail(e);
  }
}
