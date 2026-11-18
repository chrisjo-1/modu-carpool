import { body, currentUserId, db, ensureSchema, json } from "@/lib/server";
import { classifyVisit } from "@/lib/visitSource";

export const dynamic = "force-dynamic";

/**
 * 방문 기록(2026-11-18): 앱이 창을 열 때 한 번 보낸다. 같은 날 같은 기기는 한 줄(누른 횟수·시간대만 늘림), 처음 경로를 남긴다.
 * 로그인 중이면 회원을 잇고, 예전 /api/appmode 의 앱·인터넷 창·PC 기록도 여기서 함께 한다.
 */
export async function POST(req: Request) {
  const b = await body(req);
  const vid = typeof b.vid === "string" && /^[a-z0-9]{12,40}$/i.test(b.vid) ? b.vid : "";
  if (!vid) return json({ ok: false });
  const standalone = b.standalone === true;
  const mobile = b.mobile === true;
  const mode = !mobile ? "pc" : standalone ? "app" : "browser";
  const source = classifyVisit({
    utm: typeof b.utm === "string" ? b.utm : "",
    mark: typeof b.mark === "string" ? b.mark : "",
    ref: typeof b.ref === "string" ? b.ref.slice(0, 120) : "",
    inApp: typeof b.inApp === "string" ? b.inApp : "",
    standalone,
  });
  const refHost = typeof b.ref === "string" ? b.ref.slice(0, 120).toLowerCase() : "";
  const landing = typeof b.landing === "string" ? b.landing.slice(0, 40) : "";
  const isNew = b.isNew === true;
  const hour = Number(new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 13));
  try {
    await ensureSchema();
    const me = await currentUserId();
    const sql = db();
    await sql`insert into site_visits (day, vid, user_id, source, ref_host, landing, mode, is_new, hours)
      values ((now() at time zone 'Asia/Seoul')::date, ${vid}, ${me}, ${source}, ${refHost}, ${landing}, ${mode}, ${isNew}, ${1 << hour})
      on conflict (day, vid) do update set hits = site_visits.hits + 1, last_at = now(), hours = site_visits.hours | ${1 << hour},
        user_id = coalesce(site_visits.user_id, excluded.user_id), mode = excluded.mode`;
    if (me) {
      await sql`update users set app_mode = ${mode}, app_mode_at = now(),
        app_first_at = case when ${mode} = 'app' then coalesce(app_first_at, now()) else app_first_at end where id = ${me}`;
    }
  } catch (e) {
    console.error("[visit]", e);
  }
  return json({ ok: true });
}
