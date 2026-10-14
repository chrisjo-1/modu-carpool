import { notifyRouteAlerts } from "@/lib/alerts";
import { CAR_REQUIRED, carReady } from "@/lib/car";
import { grant } from "@/lib/credits";
import { PHOTO_REQUIRED, hasPhoto, isVerified } from "@/lib/verify";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin, text } from "@/lib/server";
import { MAX_PRICE, nextOccurrence, toMinutes } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 한국 주변 범위의 좌표만 받는다. 아니면 둘 다 null. */
function coord(lat: unknown, lng: unknown): [number | null, number | null] {
  const a = Number(lat);
  const o = Number(lng);
  const ok = lat != null && lng != null && Number.isFinite(a) && Number.isFinite(o) && a > 32 && a < 40 && o > 123 && o < 133;
  return ok ? [a, o] : [null, null];
}

/**
 * 가입 직후 출퇴근 정보 입력.
 * - commute: 출발지·도착지·출근 시간·1회 희망 금액을 프로필에 저장하고, 정기카풀 글로 자동 게시한다.
 *   요일과 복귀 시간은 나중에 내 정보에서 보완한다(기본값: 평일 매일).
 * - other: 출퇴근이 아니면 주요 이동경로만 프로필에 저장한다(게시하지 않는다).
 * 금액은 시간대 제한 없이 자유롭게 적는다(택시 기준 요금은 화면에서 참고로만 보여 준다).
 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const kind = b.kind === "commute" || b.kind === "other" ? b.kind : "";
  if (!kind) return json({ error: "출퇴근 또는 기타 중에서 골라 주세요." }, 400);
  const origin = text(b.origin, 60);
  const dest = text(b.dest, 60);
  if (origin.length < 2 || dest.length < 2) return json({ error: "주요 이동경로(출발지·도착지)를 입력해 주세요." }, 400);
  const [oLat, oLng] = coord(b.originLat, b.originLng);
  const [dLat, dLng] = coord(b.destLat, b.destLng);
  const timeGo = kind === "commute" ? text(b.timeGo, 5) : "";
  const price = kind === "commute" ? Math.round(Number(b.price) / 100) * 100 : 0;
  if (kind === "commute") {
    if (toMinutes(timeGo) < 0) return json({ error: "출근 시간을 확인해 주세요." }, 400);
    if (!(price >= 500 && price <= MAX_PRICE)) return json({ error: `희망 금액은 500원에서 ${MAX_PRICE.toLocaleString("ko-KR")}원 사이로 입력해 주세요.` }, 400);
  }
  try {
    await ensureSchema();
    if (!(await isVerified(me))) return json({ error: "이메일 인증을 마치면 등록할 수 있어요. 메일함을 확인해 주세요." }, 403);
    const sql = db();
    await sql`update users set commute_kind = ${kind}, commute_origin = ${origin}, commute_dest = ${dest},
      commute_olat = ${oLat}, commute_olng = ${oLng}, commute_dlat = ${dLat}, commute_dlng = ${dLng},
      commute_time = ${timeGo}, commute_price = ${price} where id = ${me}`;
    if (kind === "other") return json({ ok: true, posted: false });

    // 정기카풀 자동 게시: 사진·차량 조건을 먼저 본다. 조건이 안 맞으면 프로필만 저장하고 이유를 알려 준다.
    if (!(await hasPhoto(me))) return json({ ok: true, posted: false, reason: PHOTO_REQUIRED });
    const u = await sql`select role_pref from users where id = ${me}`;
    const role = u[0]?.role_pref === "rider" ? "rider" : "driver";
    if (role === "driver" && !(await carReady(me))) return json({ ok: true, posted: false, reason: CAR_REQUIRED });

    const days = "12345";
    const next = new Date(nextOccurrence(days, timeGo)).toISOString();
    const updated = await sql`
      update posts set role = ${role}, cost = 'fixed', price = ${price}, origin = ${origin}, dest = ${dest},
        origin_lat = ${oLat}, origin_lng = ${oLng}, dest_lat = ${dLat}, dest_lng = ${dLng},
        days = ${days}, time_go = ${timeGo}, time_back = '', depart_at = ${next}, seats = 1, status = 'open', tags = '{}'::text[]
      where user_id = ${me} and regular returning id`;
    if (updated.length) return json({ ok: true, posted: true, updated: true, id: updated[0].id });

    const hadPost = (await sql`select 1 from posts where user_id = ${me} limit 1`).length > 0;
    const rows = await sql`
      insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng,
                         regular, days, time_go, time_back, tags)
      values (${me}, ${role}, 'commute', 'fixed', ${price}, ${origin}, ${dest}, ${next}, 1, '',
              ${oLat}, ${oLng}, ${dLat}, ${dLng}, true, ${days}, ${timeGo}, '', '{}'::text[])
      returning id`;
    const credit = (await grant(me, "post").catch(() => 0)) + (hadPost ? 0 : await grant(me, "firstpost").catch(() => 0));
    await notifyRouteAlerts(String(rows[0].id)).catch(() => {});
    return json({ ok: true, posted: true, updated: false, id: rows[0].id, credit });
  } catch (e) {
    return fail(e);
  }
}
