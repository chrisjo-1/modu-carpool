import { ALERT_MAX } from "@/lib/alerts";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin, text } from "@/lib/server";

export const dynamic = "force-dynamic";

const okLat = (v: unknown) => typeof v === "number" && v >= 33 && v <= 39;
const okLng = (v: unknown) => typeof v === "number" && v >= 124 && v <= 132;

/** 내 경로 알림 목록 */
export async function GET() {
  const me = await currentUserId();
  if (!me) return needLogin();
  try {
    await ensureSchema();
    const rows = await db()`select id, label, want, o_lat, o_lng, d_lat, d_lng from route_alerts where user_id = ${me} order by id`;
    return json({ alerts: rows.map((r) => ({ id: String(r.id), label: r.label, want: r.want, oLat: r.o_lat, oLng: r.o_lng, dLat: r.d_lat, dLng: r.d_lng })), max: ALERT_MAX });
  } catch (e) {
    return fail(e);
  }
}

/** 경로 알림 추가 {origin, dest, oLat, oLng, dLat, dLng, want} */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const origin = text(b.origin, 40);
  const dest = text(b.dest, 40);
  if (!okLat(b.oLat) || !okLng(b.oLng) || !okLat(b.dLat) || !okLng(b.dLng)) return json({ error: "출발지와 도착지를 목록에서 골라 주세요." }, 400);
  const want = b.want === "driver" || b.want === "rider" ? b.want : "any";
  try {
    await ensureSchema();
    const sql = db();
    const n = await sql`select count(*)::int as n from route_alerts where user_id = ${me}`;
    if ((n[0].n as number) >= ALERT_MAX) return json({ error: "경로 알림은 3개까지 등록할 수 있어요." }, 400);
    const label = `${origin || "출발"} → ${dest || "도착"}`.slice(0, 90);
    await sql`insert into route_alerts (user_id, label, o_lat, o_lng, d_lat, d_lng, want) values (${me}, ${label}, ${b.oLat}, ${b.oLng}, ${b.dLat}, ${b.dLng}, ${want})`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^\d{1,18}$/.test(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from route_alerts where id = ${id} and user_id = ${me}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
