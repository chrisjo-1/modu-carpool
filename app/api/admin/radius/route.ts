import { RADIUS_CHOICES, RADIUS_KEYS, getRadius, type RadiusKey } from "@/lib/radius";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 반경 설정 현재 값(택시 동승, 카풀 운전자 경로 알림) */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const [taxi, route] = await Promise.all([getRadius("taxi"), getRadius("route")]);
    return json({ choices: RADIUS_CHOICES, values: { taxi, route } });
  } catch (e) {
    return fail(e);
  }
}

/** 반경 변경. 허용된 값(2·5·10km)만 저장한다. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const keys = Object.keys(RADIUS_KEYS) as RadiusKey[];
  try {
    await ensureSchema();
    const sql = db();
    for (const k of keys) {
      if (b[k] == null) continue;
      const n = Number(b[k]);
      if (!(RADIUS_CHOICES as readonly number[]).includes(n)) return json({ error: "반경은 2km, 5km, 10km 중에서 골라 주세요." }, 400);
      await sql`insert into settings (key, value) values (${RADIUS_KEYS[k]}, ${String(n)})
        on conflict (key) do update set value = excluded.value`;
    }
    const [taxi, route] = await Promise.all([getRadius("taxi"), getRadius("route")]);
    return json({ values: { taxi, route } });
  } catch (e) {
    return fail(e);
  }
}
