import { authEnabled, currentUser, db, ensureSchema, json } from "@/lib/server";

export const dynamic = "force-dynamic";

const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

async function auth() {
  if (!authEnabled()) return null;
  return currentUser();
}

export async function GET() {
  const user = await auth();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const rows = await db()`
      select id, started_at, ended_at, distance_m, duration_s, total, passengers, per_person, preset
      from rides where user_id = ${user.id} order by started_at desc limit 500`;
    return json({
      rides: rows.map((r) => ({
        id: r.id,
        startedAt: new Date(r.started_at as string).getTime(),
        endedAt: new Date(r.ended_at as string).getTime(),
        distanceM: r.distance_m,
        durationS: r.duration_s,
        total: r.total,
        passengers: r.passengers,
        perPerson: r.per_person,
        preset: r.preset,
      })),
    });
  } catch {
    return json({ error: "기록을 불러오지 못했습니다." }, 500);
  }
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const body = (await req.json().catch(() => null)) as { rides?: unknown } | null;
  const list = Array.isArray(body?.rides) ? body.rides.slice(0, 200) : [];
  try {
    await ensureSchema();
    const sql = db();
    let saved = 0;
    for (const item of list) {
      const r = (item ?? {}) as Record<string, unknown>;
      const id = typeof r.id === "string" && /^[A-Za-z0-9-]{6,40}$/.test(r.id) ? r.id : null;
      const startedAt = int(r.startedAt, 1e12, 1e13);
      const endedAt = int(r.endedAt, 1e12, 1e13);
      const distanceM = int(r.distanceM, 0, 2000000);
      const durationS = int(r.durationS, 0, 172800);
      const total = int(r.total, 0, 10000000);
      const passengers = int(r.passengers, 1, 8);
      const per = int(r.perPerson, 0, 10000000);
      const preset = typeof r.preset === "string" ? r.preset.slice(0, 20) : "";
      if (!id || startedAt === null || endedAt === null || distanceM === null || durationS === null ||
          total === null || passengers === null || per === null) continue;
      await sql`
        insert into rides (user_id, id, started_at, ended_at, distance_m, duration_s, total, passengers, per_person, preset)
        values (${user.id}, ${id}, ${new Date(startedAt).toISOString()}, ${new Date(endedAt).toISOString()},
                ${distanceM}, ${durationS}, ${total}, ${passengers}, ${per}, ${preset})
        on conflict (user_id, id) do nothing`;
      saved++;
    }
    return json({ saved });
  } catch {
    return json({ error: "기록을 저장하지 못했습니다." }, 500);
  }
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    await ensureSchema();
    await db()`delete from rides where user_id = ${user.id} and id = ${id}`;
    return json({ ok: true });
  } catch {
    return json({ error: "삭제하지 못했습니다." }, 500);
  }
}
