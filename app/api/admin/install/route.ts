import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";
import { features } from "@/lib/features";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 앱 설치 안내 설정과 최근 접속 회원의 앱·인터넷 창·PC 인원 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const [f, r] = await Promise.all([
      features(),
      db()`select
        count(*) filter (where app_mode = 'app' and app_mode_at > now() - interval '7 days')::int as app7,
        count(*) filter (where app_mode = 'browser' and app_mode_at > now() - interval '7 days')::int as web7,
        count(*) filter (where app_mode = 'pc' and app_mode_at > now() - interval '7 days')::int as pc7,
        count(*) filter (where app_mode = 'app' and app_mode_at > now() - interval '30 days')::int as app30,
        count(*) filter (where app_mode = 'browser' and app_mode_at > now() - interval '30 days')::int as web30,
        count(*) filter (where app_mode = 'pc' and app_mode_at > now() - interval '30 days')::int as pc30,
        count(*) filter (where app_first_at is not null)::int as ever_app
        from users where not test and withdrawn_at is null`,
    ]);
    return json({ gate: f.installGate, stats: r[0] });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 앱 설치 안내 끄기 · 권유 · 필수 {gate} */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const gate = b.gate === "nudge" || b.gate === "require" ? b.gate : "off";
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values ('install_gate', ${gate}) on conflict (key) do update set value = excluded.value`;
    return json({ gate });
  } catch (e) {
    return fail(e);
  }
}
