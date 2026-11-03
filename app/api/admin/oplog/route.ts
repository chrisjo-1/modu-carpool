import { logOps } from "@/lib/opsLog";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 운영 일지 최근 300건. cat=admin(자동 조치)·memo(메모)로 거를 수 있다. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const cat = new URL(req.url).searchParams.get("cat") ?? "";
  try {
    await ensureSchema();
    const items = await db()`select id, extract(epoch from at)::bigint * 1000 as at, category, actor, action, detail
      from ops_log where (${cat} = '' or category = ${cat}) order by at desc limit 300`;
    return json({ items });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 메모 한 줄 남기기 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const memo = String(b.text ?? "").trim();
  if (!memo) return json({ error: "내용을 적어 주세요." }, 400);
  await logOps("memo", memo.slice(0, 120), memo.length > 120 ? memo.slice(0, 1000) : "");
  return json({ ok: true });
}
