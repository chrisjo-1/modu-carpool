import { notifyTaxi } from "@/lib/taxi";
import { isVerified } from "@/lib/verify";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 한국 주변 범위의 좌표만 받는다. */
function coord(lat: unknown, lng: unknown): [number | null, number | null] {
  const a = Number(lat);
  const o = Number(lng);
  const ok = lat != null && lng != null && Number.isFinite(a) && Number.isFinite(o) && a > 32 && a < 40 && o > 123 && o < 133;
  return ok ? [a, o] : [null, null];
}

/** 택시 동승 글 올리기. 출발지 좌표가 있어야 반경 푸시를 보낼 수 있다. 1시간에 3개까지. */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const origin = text(b.origin, 60);
  const dest = text(b.dest, 60);
  const [oLat, oLng] = coord(b.originLat, b.originLng);
  const [dLat, dLng] = coord(b.destLat, b.destLng);
  const at = new Date(String(b.at ?? ""));
  const seats = Math.round(Number(b.seats ?? 1));
  const note = text(b.note, 200);
  if (origin.length < 2 || dest.length < 2) return json({ error: "출발지와 도착지를 입력해 주세요." }, 400);
  if (oLat == null || oLng == null) return json({ error: "출발지를 목록에서 골라 주세요." }, 400);
  if (!Number.isFinite(at.getTime())) return json({ error: "출발 시각을 골라 주세요." }, 400);
  const now = Date.now();
  if (at.getTime() < now - 5 * 60_000 || at.getTime() > now + 24 * 3600_000) return json({ error: "출발 시각은 지금부터 24시간 안에서 골라 주세요." }, 400);
  if (!(seats >= 1 && seats <= 3)) return json({ error: "동승 인원은 1~3명으로 골라 주세요." }, 400);
  try {
    await ensureSchema();
    if (!(await isVerified(me))) return json({ error: "이메일 인증을 마치면 글을 올릴 수 있어요. 메일함을 확인해 주세요." }, 403);
    const sql = db();
    const recent = await sql`select count(*)::int as n from posts where user_id = ${me} and service = 'taxi' and created_at > now() - interval '1 hour'`;
    if ((recent[0].n as number) >= 3) return json({ error: "택시 동승 글은 1시간에 3개까지 올릴 수 있어요." }, 429);
    const rows = await sql`insert into posts (user_id, role, kind, service, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng)
      values (${me}, 'rider', 'trip', 'taxi', 'free', 0, ${origin}, ${dest}, ${at.toISOString()}, ${seats}, ${note}, ${oLat}, ${oLng}, ${dLat}, ${dLng})
      returning id`;
    const id = String(rows[0].id);
    const sent = await notifyTaxi(id);
    return json({ id, sent });
  } catch (e) {
    return fail(e);
  }
}
