import { getJobCfg, poolJobState, setJobCfg } from "@/lib/poolJob";
import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 관리자 '정기 매칭' 탭: 일괄 게시·안내 메일 상태 보기 / 켜기·멈추기 / 메일 다시 켜기 */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    return json(await poolJobState());
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const b = await body(req);
    const cfg = await getJobCfg();
    if (b.action === "on") await setJobCfg({ ...cfg, on: true });
    if (b.action === "off") await setJobCfg({ ...cfg, on: false });
    if (b.action === "resumeMail") await db()`delete from settings where key = 'pool_job_mail_paused'`;
    return json({ ok: true, ...(await poolJobState()) });
  } catch (e) {
    return fail(e);
  }
}
