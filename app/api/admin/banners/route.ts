import { BANNER_KEY, cleanBanners, readBanners } from "@/lib/banners";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 전체 배너 목록 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    return json({ banners: await readBanners() });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 배너 목록 전체를 저장한다(순서 포함). */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const cleaned = cleanBanners(b.banners);
  if (!cleaned.ok) return json({ error: cleaned.error }, 400);
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values (${BANNER_KEY}, ${JSON.stringify(cleaned.banners)})
      on conflict (key) do update set value = excluded.value`;
    return json({ banners: cleaned.banners });
  } catch (e) {
    return fail(e);
  }
}
