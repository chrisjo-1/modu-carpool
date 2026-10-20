import { PILOT_CHOICES, SEAT_ENABLED_KEY, SEAT_PILOT_KEY, readSeatConfig } from "@/lib/seatConfig";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 지하철 관리 현재 값 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    return json({ config: await readSeatConfig(), choices: PILOT_CHOICES });
  } catch (e) {
    return fail(e);
  }
}

/** 열기 여부와 시범 노선 저장. 시범 노선은 열 수 있는 노선(PILOT_CHOICES)만 받는다. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();
    if (typeof b.enabled === "boolean") {
      await sql`insert into settings (key, value) values (${SEAT_ENABLED_KEY}, ${b.enabled ? "1" : "0"})
        on conflict (key) do update set value = excluded.value`;
    }
    if (Array.isArray(b.pilot)) {
      const pilot = [...new Set(b.pilot.map(String))];
      if (!pilot.every((p) => PILOT_CHOICES.includes(p))) {
        return json({ error: "열 수 없는 노선이 들어 있어요. 2·5·6·7·9호선 중에서 골라 주세요." }, 400);
      }
      await sql`insert into settings (key, value) values (${SEAT_PILOT_KEY}, ${JSON.stringify(pilot)})
        on conflict (key) do update set value = excluded.value`;
    }
    return json({ config: await readSeatConfig() });
  } catch (e) {
    return fail(e);
  }
}
