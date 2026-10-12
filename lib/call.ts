import { db } from "./server";
import { sendPush, pushText } from "./push";
import { adjust, spend } from "./credits";
import { contactLabel } from "./types";

export const DEFAULT_CALL_RADIUS_KM = 3;
export const CALL_COST = 1000;

/** 호출 반경(km). 관리자가 정하고, 0.5 ~ 20km 사이로 제한한다. */
export async function getCallRadiusKm(): Promise<number> {
  const rows = await db()`select value from settings where key = 'call_radius_km'`;
  const v = rows.length ? Number(rows[0].value) : DEFAULT_CALL_RADIUS_KM;
  return Number.isFinite(v) && v >= 0.5 && v <= 20 ? v : DEFAULT_CALL_RADIUS_KM;
}

/** 호출자가 연락 방법과 아이디를 모두 등록했는지 */
export async function callerReady(me: string) {
  const rows = await db()`select contact, contact_type from users where id = ${me}`;
  if (!rows.length) return { ready: false, type: "" };
  // 목록에 없는 예전 값(예: 전화번호 삭제 전 저장분)은 등록된 것으로 보지 않는다.
  const type = String(rows[0].contact_type ?? "");
  const ok = String(rows[0].contact ?? "").trim() !== "" && contactLabel(type) !== "";
  return { ready: ok, type };
}

/**
 * CALL: 연락 방법이 등록된 회원이 내 글 하나를 골라 1,000 크레딧을 쓰면,
 * 같은 글을 지금 시간으로 다시 올리고 출발지 반경 안의 운전자 글 작성자에게 알린다.
 * 응답하는 운전자가 없어도 크레딧은 환불되지 않는다. (글을 다시 올리지 못한 기술 오류만 환불)
 */
export async function callDrivers(me: string, postId: string) {
  const sql = db();
  const cr = await callerReady(me);
  if (!cr.ready) return { error: "CALL을 쓰려면 프로필에서 연락 방법과 아이디를 먼저 등록해 주세요." } as const;
  const mine = await sql`select origin, dest, origin_lat, origin_lng, status from posts where id = ${postId} and user_id = ${me}`;
  if (!mine.length) return { error: "내가 올린 글만 호출할 수 있어요." } as const;
  const p = mine[0];
  if (p.origin_lat == null || p.origin_lng == null) return { error: "출발지 위치가 없는 글은 호출할 수 없어요." } as const;
  if (p.status !== "open") return { error: "진행 중이거나 닫힌 글은 호출할 수 없어요." } as const;
  const radiusKm = await getCallRadiusKm();
  const lat = Number(p.origin_lat);
  const lng = Number(p.origin_lng);
  const paid = await spend(me, CALL_COST, "call", `글 ${postId.slice(0, 8)}`);
  if (!paid) return { error: `크레딧이 부족해요. CALL에는 ${CALL_COST.toLocaleString("ko-KR")} 크레딧이 필요해요.` } as const;
  const copied = await sql`insert into posts (user_id, role, kind, cost, origin, dest, depart_at, seats, note, status, origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share)
    select user_id, role, 'trip', cost, origin, dest, now(), seats, note, 'open', origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share
    from posts where id = ${postId} and user_id = ${me} returning id`;
  if (!copied.length) {
    await adjust(me, CALL_COST, "CALL 실패 환불").catch(() => null);
    return { error: "글을 다시 올리지 못했어요. 크레딧은 돌려 드렸어요." } as const;
  }
  const call = await sql`insert into calls (caller, post_id, radius_km) values (${me}, ${String(copied[0].id)}, ${radiusKm}) returning id`;
  const callId = String(call[0].id);
  const drivers = await sql`
    select distinct p.user_id from posts p join users u on u.id = p.user_id
    where p.role = 'driver' and p.status = 'open' and p.user_id <> ${me} and not u.blocked
      and p.origin_lat is not null and p.origin_lng is not null
      and p.depart_at > now() - interval '1 hour'
      and 6371 * 2 * asin(sqrt(power(sin(radians(p.origin_lat - ${lat}) / 2), 2)
        + cos(radians(${lat})) * cos(radians(p.origin_lat)) * power(sin(radians(p.origin_lng - ${lng}) / 2), 2))) <= ${radiusKm}
    limit 500`;
  const ids = drivers.map((d) => String(d.user_id));
  if (ids.length) await sql`insert into call_recipients (call_id, user_id) select ${callId}, unnest(${ids}::uuid[]) on conflict do nothing`;
  const title = "주변 탑승자가 호출했어요";
  const body = pushText.cut(`${String(p.origin)} → ${String(p.dest)} · 반경 ${radiusKm}km · 수락하면 연락처가 보여요`, 120);
  await Promise.all(ids.map((id) => sendPush(id, { title, body, url: `/?call=${callId}`, tag: `call-${callId}` })));
  return { ok: true, callId, notified: ids.length, radiusKm, spent: CALL_COST, newPostId: String(copied[0].id) } as const;
}

/** 받은 호출 한 건(받은 회원에게만) */
export async function incomingCall(me: string, callId: string) {
  const rows = await db()`select c.id, p.origin, p.dest, u.member_code, u.contact_type,
      exists(select 1 from call_accepts a where a.call_id = c.id and a.user_id = ${me}) as accepted
    from calls c join call_recipients r on r.call_id = c.id and r.user_id = ${me}
    join posts p on p.id = c.post_id join users u on u.id = c.caller
    where c.id = ${callId}`;
  if (!rows.length) return null;
  const r = rows[0];
  return { callId, origin: String(r.origin), dest: String(r.dest), callerCode: String(r.member_code ?? ""), accepted: r.accepted === true };
}

/** 호출을 받은 회원이 수락하면, 호출자가 등록한 연락 방법과 아이디를 보여 준다. */
export async function acceptCall(me: string, callId: string) {
  const sql = db();
  const rec = await sql`select 1 from call_recipients where call_id = ${callId} and user_id = ${me}`;
  if (!rec.length) return { error: "호출을 받은 회원만 수락할 수 있어요." } as const;
  await sql`insert into call_accepts (call_id, user_id) values (${callId}, ${me}) on conflict do nothing`;
  const c = await sql`select u.contact, u.contact_type from calls c join users u on u.id = c.caller where c.id = ${callId}`;
  if (!c.length) return { error: "호출을 찾을 수 없어요." } as const;
  const type = String(c[0].contact_type ?? "");
  const contact = String(c[0].contact ?? "");
  if (!type || !contact) return { error: "호출한 회원의 연락 방법이 없어요." } as const;
  return { ok: true, contactType: contactLabel(type), contact } as const;
}
