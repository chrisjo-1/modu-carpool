import { db } from "./server";
import { sendPush, pushText } from "./push";
import { adjust, spend } from "./credits";
import { contactLabel } from "./types";
import { boundingBox } from "./radius";
import { REASON_LABEL, getRules } from "./credits";

export const DEFAULT_CALL_RADIUS_KM = 5;
export const CALL_COST = 1000;
/** 하루(한국 시간 기준) CALL 횟수 */
export const DAILY_CALL_LIMIT = 2;
/** 회원이 앱을 열 때 기록한 위치를 쓸 수 있는 시간(분). 이보다 오래된 위치의 운전자는 찾지 않는다. */
export const LOCATION_FRESH_MIN = 60;

/** 오늘 남은 CALL 횟수 (한국 시간 자정 기준) */
export async function callStatus(me: string) {
  const rows = await db()`select count(*)::int as n from calls
    where caller = ${me} and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`;
  const used = Number(rows[0]?.n ?? 0);
  return { used, left: Math.max(0, DAILY_CALL_LIMIT - used), limit: DAILY_CALL_LIMIT };
}

/** 크레딧이 모자랄 때 채우는 방법 안내. 적립 기준은 관리자가 바꿀 수 있어서 현재 값으로 만든다. */
async function chargeGuide(): Promise<string> {
  const r = await getRules();
  const parts = [
    `${REASON_LABEL.attend} 하루 ${r.attend.toLocaleString("ko-KR")}`,
    `${REASON_LABEL.post} 하루 1회 ${r.post.toLocaleString("ko-KR")}`,
    `${REASON_LABEL.car} ${r.car.toLocaleString("ko-KR")}`,
    `${REASON_LABEL.nudge} ${r.nudge.toLocaleString("ko-KR")}`,
  ];
  return `크레딧은 ${parts.join(" · ")}으로 채울 수 있어요. 내 정보에서 확인해 보세요.`;
}

/** 회원의 현재 위치를 기록한다. 소수점 넷째 자리(약 11m)까지만 저장한다. */
export async function saveLocation(me: string, lat: number, lng: number) {
  const la = Math.round(lat * 1e4) / 1e4;
  const ln = Math.round(lng * 1e4) / 1e4;
  await db()`update users set loc_lat = ${la}, loc_lng = ${ln}, loc_at = now() where id = ${me}`;
}

/** 호출 반경(km). 관리자가 정하고, 0.5 ~ 20km 사이로 제한한다. */
export async function getCallRadiusKm(): Promise<number> {
  const rows = await db()`select value from settings where key = 'call_radius_km'`;
  const v = rows.length ? Number(rows[0].value) : DEFAULT_CALL_RADIUS_KM;
  return Number.isFinite(v) && v >= 0.5 && v <= 20 ? v : DEFAULT_CALL_RADIUS_KM;
}

/**
 * 호출자 현위치 반경 안의 운전자 id 목록.
 * 조건: 최근 1시간 안에 위치 갱신, 차량 등록, 알림 켬, 관리자 차단·테스트 아님, 차단한 사이 아님.
 */
export async function findDrivers(me: string, lat: number, lng: number, radiusKm: number): Promise<string[]> {
  const box = boundingBox(lat, lng, radiusKm);
  const rows = await db()`
    select u.id as user_id from users u
    where u.id <> ${me} and not u.blocked and not u.test and u.notify
      and u.car_no <> '' and u.car_v > 0
      and u.loc_lat is not null and u.loc_lng is not null
      and u.loc_at > now() - make_interval(mins => ${LOCATION_FRESH_MIN})
      and u.loc_lat between ${box.minLat} and ${box.maxLat} and u.loc_lng between ${box.minLng} and ${box.maxLng}
      and 6371 * 2 * asin(sqrt(power(sin(radians(u.loc_lat - ${lat}) / 2), 2)
        + cos(radians(${lat})) * cos(radians(u.loc_lat)) * power(sin(radians(u.loc_lng - ${lng}) / 2), 2))) <= ${radiusKm}
      and not exists (select 1 from blocks k where (k.blocker = u.id and k.blocked = ${me}) or (k.blocker = ${me} and k.blocked = u.id))
    limit 500`;
  return rows.map((r) => String(r.user_id));
}

/**
 * 주변 운전자 수를 구간으로만 알려 준다(정확한 수·위치를 숨겨 위치 추적에 쓰지 못하게 한다).
 * 0 · 1-2 · 3-5 · 6+
 */
export async function nearbyBand(me: string, lat: number, lng: number): Promise<"0" | "1-2" | "3-5" | "6+"> {
  const radiusKm = await getCallRadiusKm();
  const n = (await findDrivers(me, lat, lng, radiusKm)).length;
  if (n === 0) return "0";
  if (n <= 2) return "1-2";
  if (n <= 5) return "3-5";
  return "6+";
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
 * 같은 글을 지금 시간으로 다시 올리고, 호출하는 순간 내 현재 위치(lat, lng) 반경 안에서
 * 최근 1시간 안에 위치를 갱신한 운전자에게 알린다. 거리 계산과 대상 선정은 모두 서버에서 한다.
 * 응답하는 운전자가 없어도 크레딧은 환불되지 않는다. (글을 다시 올리지 못한 기술 오류만 환불)
 */
export async function callDrivers(me: string, postId: string, lat: number, lng: number) {
  const sql = db();
  const cr = await callerReady(me);
  if (!cr.ready) return { error: "CALL을 쓰려면 프로필에서 연락 방법과 아이디를 먼저 등록해 주세요." } as const;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요." } as const;
  }
  const mine = await sql`select origin, dest, origin_lat, origin_lng, status from posts where id = ${postId} and user_id = ${me}`;
  if (!mine.length) return { error: "내가 올린 글만 호출할 수 있어요." } as const;
  const p = mine[0];
  if (p.status !== "open") return { error: "진행 중이거나 닫힌 글은 호출할 수 없어요." } as const;
  const st = await callStatus(me);
  if (st.left <= 0) return { error: `오늘 CALL은 ${DAILY_CALL_LIMIT}번까지 쓸 수 있어요. 내일 다시 이용해 주세요.` } as const;
  const radiusKm = await getCallRadiusKm();
  // 알릴 운전자가 없으면 크레딧을 쓰기 전에 멈춘다.
  const ids = await findDrivers(me, lat, lng, radiusKm);
  if (!ids.length) return { error: "근처 1시간 안에 위치를 기록한 운전자가 없어요. 호출하지 않았고 크레딧도 차감되지 않았어요." } as const;
  const paid = await spend(me, CALL_COST, "call", `글 ${postId.slice(0, 8)}`);
  if (!paid) {
    const guide = await chargeGuide();
    return { error: `크레딧이 부족해요. CALL에는 ${CALL_COST.toLocaleString("ko-KR")} 크레딧이 필요해요. ${guide}` } as const;
  }
  const copied = await sql`insert into posts (user_id, role, kind, cost, origin, dest, depart_at, seats, note, status, origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share)
    select user_id, role, 'trip', cost, origin, dest, now(), seats, note, 'open', origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share
    from posts where id = ${postId} and user_id = ${me} returning id`;
  if (!copied.length) {
    await adjust(me, CALL_COST, "CALL 실패 환불").catch(() => null);
    return { error: "글을 다시 올리지 못했어요. 크레딧은 돌려 드렸어요." } as const;
  }
  const call = await sql`insert into calls (caller, post_id, radius_km, caller_lat, caller_lng) values (${me}, ${String(copied[0].id)}, ${radiusKm}, ${lat}, ${lng}) returning id`;
  const callId = String(call[0].id);
  if (ids.length) await sql`insert into call_recipients (call_id, user_id) select ${callId}, unnest(${ids}::uuid[]) on conflict do nothing`;
  const title = "주변 탑승자가 호출했어요";
  const body = pushText.cut(`${String(p.origin)} → ${String(p.dest)} · 내 위치 반경 ${radiusKm}km · 수락하면 연락처가 보여요`, 120);
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
