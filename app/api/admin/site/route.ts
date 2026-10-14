import { DEFAULT_SLOGAN, SLOGAN_MAX, getSlogan } from "@/lib/slogan";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 현재 주제목 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    return json({ slogan: await getSlogan(), defaultSlogan: DEFAULT_SLOGAN, max: SLOGAN_MAX });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 주제목 변경. 비우면 기본 문구로 되돌린다. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const v = String(b.slogan ?? "").trim();
  if (v.length > SLOGAN_MAX) return json({ error: `주제목은 ${SLOGAN_MAX}자 이내로 적어 주세요.` }, 400);
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values ('site_slogan', ${v})
      on conflict (key) do update set value = excluded.value`;
    return json({ slogan: await getSlogan() });
  } catch (e) {
    return fail(e);
  }
}
