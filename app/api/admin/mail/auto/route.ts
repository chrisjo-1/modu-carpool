import { autoState, recentBounceRate, resumeAuto } from "@/lib/mailAuto";
import { body, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 관리자 발송 화면: 자동 이어 보내기 상태(멈춤 사유·최근 반송률·반송 정리 진행) 보기 / 다시 켜기 */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    return json({ ...(await autoState()), bounce: await recentBounceRate() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const b = await body(req);
    if (b.action === "resume") await resumeAuto();
    return json({ ok: true, ...(await autoState()) });
  } catch (e) {
    return fail(e);
  }
}
