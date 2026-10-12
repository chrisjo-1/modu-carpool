import { db } from "./server";
import { sendPush, pushText } from "./push";
import { adjust, spend } from "./credits";

export const DEFAULT_CALL_RADIUS_KM = 3;
/** 호출 반경(km). 관리자가 정하고, 0.5 ~ 20km 사이로 제한한다. */
export async function getCallRadiusKm(): Promise<number> {
  const rows = await db()`select value from settings where key = 'call_radius_km'`;
  const v = rows.length ? Number(rows[0].value) : DEFAULT_CALL_RADIUS_KM;
  return Number.isFinite(v) && v >= 0.5 && v <= 20 ? v : DEFAULT_CALL_RADIUS_KM;
}

export const CALL_COST = 1000;

/**
 * CALL: 내가 올린 글 하나를 골라 1,000 크레딧을 쓰고,
 * (1) 같은 글을 지금 시간으로 새 글로 다시 올리고 (2) 출발지 반경 안의 운전자 글 작성자에게 알린다.
 * 알림 대상은 운전자만, 본인과 차단된 회원은 제외, 같은 회원은 한 번만 보낸다.
 */
export async function callDrivers(me: string, postId: string) {
  const sql = db();
  const mine = await sql`select origin, dest, origin_lat, origin_lng, status from posts where id = ${postId} and user_id = ${me}`;
  if (!mine.length) return { error: "내가 올린 글만 호출할 수 있어요." } as const;
  const p = mine[0];
  if (p.origin_lat == null || p.origin_lng == null) return { error: "출발지 위치가 없는 글은 호출할 수 없어요." } as const;
  if (p.status !== "open") return { error: "진행 중이거나 닫힌 글은 호출할 수 없어요." } as const;
  const radiusKm = await getCallRadiusKm();
  const lat = Number(p.origin_lat);
  const lng = Number(p.origin_lng);
  // 크레딧을 먼저 차감한다. 잔액이 모자라면 아무 일도 하지 않는다.
  const paid = await spend(me, CALL_COST, "call", `글 ${postId.slice(0, 8)}`);
  if (!paid) return { error: `크레딧이 부족해요. CALL에는 ${CALL_COST.toLocaleString("ko-KR")} 크레딧이 필요해요.` } as const;
  // 같은 글을 지금 시간으로 다시 올린다(정기 표시 없이 일회성 글).
  const copied = await sql`insert into posts (user_id, role, kind, cost, origin, dest, depart_at, seats, note, status, origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share)
    select user_id, role, 'trip', cost, origin, dest, now(), seats, note, 'open', origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share
    from posts where id = ${postId} and user_id = ${me} returning id`;
  if (!copied.length) {
    await adjust(me, CALL_COST, "CALL 실패 환불").catch(() => null);
    return { error: "글을 다시 올리지 못했어요. 크레딧은 돌려 드렸어요." } as const;
  }
  const drivers = await sql`
    select distinct p.user_id from posts p join users u on u.id = p.user_id
    where p.role = 'driver' and p.status = 'open' and p.user_id <> ${me} and not u.blocked
      and p.origin_lat is not null and p.origin_lng is not null
      and p.depart_at > now() - interval '1 hour'
      and 6371 * 2 * asin(sqrt(power(sin(radians(p.origin_lat - ${lat}) / 2), 2)
        + cos(radians(${lat})) * cos(radians(p.origin_lat)) * power(sin(radians(p.origin_lng - ${lng}) / 2), 2))) <= ${radiusKm}
    limit 500`;
  const title = "주변 탑승자가 호출했어요";
  const body = pushText.cut(`${String(p.origin)} → ${String(p.dest)} · 반경 ${radiusKm}km`, 120);
  await Promise.all(drivers.map((d) => sendPush(String(d.user_id), { title, body, url: "/", tag: "call" })));
  return { ok: true, notified: drivers.length, radiusKm, spent: CALL_COST, newPostId: String(copied[0].id) } as const;
}
