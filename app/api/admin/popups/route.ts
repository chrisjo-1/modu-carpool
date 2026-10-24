import { POPUP_KEY, cleanPopups, readPopups } from "@/lib/popups";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 앱 접속 팝업 전체와 바뀌는 간격 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    return json(await readPopups());
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 팝업 목록(순서 포함)과 간격을 한 번에 저장 {items, interval} */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const c = cleanPopups(b.items, b.interval);
  if (!c.ok) return json({ error: c.error }, 400);
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values (${POPUP_KEY}, ${JSON.stringify(c.config)})
      on conflict (key) do update set value = excluded.value`;
    return json(c.config);
  } catch (e) {
    return fail(e);
  }
}
