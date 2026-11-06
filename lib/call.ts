import { db } from "./server";
import { sendPush, pushText } from "./push";
import { adjust, spend } from "./credits";
import { contactLabel } from "./types";
import { boundingBox } from "./radius";
import { REASON_LABEL, getRules } from "./credits";
import { allowedTags, getKeywords } from "./keywords";

export const DEFAULT_CALL_RADIUS_KM = 5;
/** CALL 1회 차감 크레딧 기본값. 회원이 많아지기 전까지는 0(무료)이고, 관리자 반경 탭에서 바꾼다. */
export const DEFAULT_CALL_COST = 0;
export const CALL_COST_MAX = 10000;
/** 하루(한국 시간 기준) CALL 횟수 */
export const DAILY_CALL_LIMIT = 2;
/** 회원이 앱을 열 때 기록한 위치를 쓸 수 있는 시간(분). 이보다 오래된 위치의 운전자는 찾지 않는다. */
export const LOCATION_FRESH_MIN = 60;
/**
 * CALL 시간 여유(2026-11-06 사용자 지시 "CALL은 택시가 아니라 어느 정도 시간 여유가 필요"):
 * 출발 시각은 최소 30분 뒤 ~ 24시간 안. 그 시각 ±30분에 운전 글이 있는 운전자에게 '시간도 맞아요'로 알리고,
 * 출발 15분 전까지 아무도 수락하지 않으면 자동으로 끝내고 보낸 분께 알린다.
 */
export const CALL_MIN_LEAD_MIN = 30;
export const CALL_MAX_LEAD_H = 24;
export const CALL_EXPIRE_BEFORE_MIN = 15;
export const CALL_TIME_MATCH_MIN = 30;

/** 보낸 출발 시각(ms)을 확인한다. 없으면 30분 뒤. */
export function callDepart(v: unknown): Date | { error: string } {
  const now = Date.now();
  const ms = v == null || v === "" ? now + CALL_MIN_LEAD_MIN * 60_000 : Number(v);
  if (!Number.isFinite(ms)) return { error: "출발 시각을 다시 골라 주세요." };
  if (ms < now + (CALL_MIN_LEAD_MIN - 1) * 60_000) return { error: `CALL은 카풀이라 최소 ${CALL_MIN_LEAD_MIN}분 뒤 출발부터 부를 수 있어요.` };
  if (ms > now + CALL_MAX_LEAD_H * 3600_000) return { error: `CALL은 ${CALL_MAX_LEAD_H}시간 안의 출발만 부를 수 있어요. 더 뒤라면 카풀 글을 올려 주세요.` };
  return new Date(Math.round(ms / 60_000) * 60_000);
}

/** 한국 시각 "오후 6:30" */
function hmKo(d: Date) {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const h = k.getUTCHours();
  const m = String(k.getUTCMinutes()).padStart(2, "0");
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
}

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

/** CALL 차감 크레딧(관리자 설정 call_cost). 0 ~ 10,000, 100 단위. 잘못된 값이면 기본값. */
export async function getCallCost(): Promise<number> {
  const rows = await db()`select value from settings where key = 'call_cost'`;
  if (!rows.length) return DEFAULT_CALL_COST;
  const v = Number(rows[0].value);
  return Number.isInteger(v) && v >= 0 && v <= CALL_COST_MAX && v % 100 === 0 ? v : DEFAULT_CALL_COST;
}

/** 호출 반경(km). 관리자가 정하고, 0.5 ~ 20km 사이로 제한한다. */
export async function getCallRadiusKm(): Promise<number> {
  const rows = await db()`select value from settings where key = 'call_radius_km'`;
  const v = rows.length ? Number(rows[0].value) : DEFAULT_CALL_RADIUS_KM;
  return Number.isFinite(v) && v >= 0.5 && v <= 20 ? v : DEFAULT_CALL_RADIUS_KM;
}

/**
 * 호출자 현위치 반경 안에 들어오는 운전자 id 목록. 두 경로를 합쳐 중복 없이 센다.
 *  1) 현재 위치: 최근 1시간 안에 위치를 기록한 운전자가 호출 위치 반경 안에 있음
 *  2) 이력: 운전자로 올린 카풀 글(출퇴근·정기 포함)의 출발지나 도착지가 호출 위치 반경 안에 있음
 * 공통 조건: 차량 등록, 알림 켬, 관리자 차단·테스트 아님, 차단한 사이 아님, 위치 권한을 허용한 적이 있음(loc_at 있음).
 */
export async function findDrivers(me: string, lat: number, lng: number, radiusKm: number): Promise<string[]> {
  const box = boundingBox(lat, lng, radiusKm);
  const rows = await db()`
    select u.id as user_id from users u
    where u.id <> ${me} and not u.blocked and not u.test and u.notify
      and u.car_no <> '' and u.car_v > 0
      and u.loc_at is not null
      and not exists (select 1 from blocks k where (k.blocker = u.id and k.blocked = ${me}) or (k.blocker = ${me} and k.blocked = u.id))
      and (
        (u.loc_at > now() - make_interval(mins => ${LOCATION_FRESH_MIN})
          and u.loc_lat between ${box.minLat} and ${box.maxLat} and u.loc_lng between ${box.minLng} and ${box.maxLng}
          and 6371 * 2 * asin(sqrt(power(sin(radians(u.loc_lat - ${lat}) / 2), 2)
            + cos(radians(${lat})) * cos(radians(u.loc_lat)) * power(sin(radians(u.loc_lng - ${lng}) / 2), 2))) <= ${radiusKm})
        or exists (select 1 from posts p where p.user_id = u.id and p.role = 'driver'
          and ((p.origin_lat is not null and 6371 * 2 * asin(sqrt(power(sin(radians(p.origin_lat - ${lat}) / 2), 2)
              + cos(radians(${lat})) * cos(radians(p.origin_lat)) * power(sin(radians(p.origin_lng - ${lng}) / 2), 2))) <= ${radiusKm})
            or (p.dest_lat is not null and 6371 * 2 * asin(sqrt(power(sin(radians(p.dest_lat - ${lat}) / 2), 2)
              + cos(radians(${lat})) * cos(radians(p.dest_lat)) * power(sin(radians(p.dest_lng - ${lng}) / 2), 2))) <= ${radiusKm})))
      )
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
export async function callDrivers(me: string, postId: string, lat: number, lng: number, departAt: Date) {
  const sql = db();
  const cr = await callerReady(me);
  if (!cr.ready) return { error: "CALL을 쓰려면 프로필에서 연락 방법과 아이디를 먼저 등록해 주세요." } as const;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요." } as const;
  }
  const mine = await sql`select origin, dest, status from posts where id = ${postId} and user_id = ${me}`;
  if (!mine.length) return { error: "내가 올린 글만 호출할 수 있어요." } as const;
  const p = mine[0];
  if (p.status !== "open") return { error: "진행 중이거나 닫힌 글은 호출할 수 없어요." } as const;
  // 내 글을 지금 시간으로 다시 올린 뒤 그 글로 호출한다.
  return sendCall(me, lat, lng, String(p.origin), String(p.dest), `글 ${postId.slice(0, 8)}`, postId, departAt, async () => {
    const copied = await sql`insert into posts (user_id, role, kind, cost, origin, dest, depart_at, seats, note, status, origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share)
      select user_id, role, 'trip', cost, origin, dest, ${departAt.toISOString()}, seats, note, 'open', origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share
      from posts where id = ${postId} and user_id = ${me} returning id`;
    return copied.length ? String(copied[0].id) : null;
  });
}

export type QuickCallInput = {
  origin: string;
  dest: string;
  oLat: number | null;
  oLng: number | null;
  dLat: number | null;
  dLng: number | null;
  /** 감사 표시 키워드 id(음료·쿠폰·기타 중 하나). 없으면 빈 문자열 */
  gift: string;
  lat: number;
  lng: number;
  departAt: Date;
};

/**
 * 빠른 호출: 등록된 내 글이 없어도 현재 위치(출발지 기본)와 도착지만 골라 호출한다.
 * 감사 표시는 무료 운행 키워드 중 하나를 고른다. 호출 글은 이때 새로 만들어 호출 기록에 연결한다.
 */
export async function quickCall(me: string, v: QuickCallInput) {
  const sql = db();
  const cr = await callerReady(me);
  if (!cr.ready) return { error: "CALL을 쓰려면 프로필에서 연락 방법과 아이디를 먼저 등록해 주세요." } as const;
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) {
    return { error: "현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요." } as const;
  }
  const origin = v.origin.trim().slice(0, 100);
  const dest = v.dest.trim().slice(0, 100);
  if (!origin || !dest) return { error: "출발지와 도착지를 골라 주세요." } as const;
  const kw = await getKeywords();
  const tags = allowedTags(kw, v.gift ? [v.gift] : [], "rider", "free").filter((id) => kw.gift.some((k) => k.id === id));
  const oLat = v.oLat ?? v.lat;
  const oLng = v.oLng ?? v.lng;
  return sendCall(me, v.lat, v.lng, origin, dest, "빠른 호출", null, v.departAt, async () => {
    const rows = await sql`insert into posts (user_id, role, kind, cost, origin, dest, depart_at, seats, note, status, origin_lat, origin_lng, dest_lat, dest_lng, price, tags, taxi_share)
      values (${me}, 'rider', 'trip', 'free', ${origin}, ${dest}, ${v.departAt.toISOString()}, 1, '', 'open', ${oLat}, ${oLng}, ${v.dLat}, ${v.dLng}, 0, ${tags}::text[], false)
      returning id`;
    return rows.length ? String(rows[0].id) : null;
  });
}

/**
 * 호출 공통 처리: 오늘 횟수·반경·차감, 호출 글 준비(makePost), 호출 기록, 운전자 푸시.
 * 알릴 운전자가 없으면 크레딧을 쓰기 전에 멈춘다. 글을 못 만든 기술 오류만 차감을 돌려준다.
 */
async function sendCall(
  me: string,
  lat: number,
  lng: number,
  origin: string,
  dest: string,
  memo: string,
  sourcePostId: string | null,
  departAt: Date,
  makePost: () => Promise<string | null>,
) {
  const sql = db();
  const st = await callStatus(me);
  if (st.left <= 0) return { error: `오늘 CALL은 ${DAILY_CALL_LIMIT}번까지 쓸 수 있어요. 내일 다시 이용해 주세요.` } as const;
  const radiusKm = await getCallRadiusKm();
  const cost = await getCallCost();
  const ids = await findDrivers(me, lat, lng, radiusKm);
  if (!ids.length) return { error: "근처에 알릴 운전자가 없어요. 호출하지 않았고 크레딧도 차감되지 않았어요." } as const;
  // 차감 기준이 0이면 크레딧을 쓰지도 돌려주지도 않는다.
  if (cost > 0) {
    const paid = await spend(me, cost, "call", memo);
    if (!paid) {
      const guide = await chargeGuide();
      return { error: `크레딧이 부족해요. CALL에는 ${cost.toLocaleString("ko-KR")} 크레딧이 필요해요. ${guide}` } as const;
    }
  }
  const postId = await makePost();
  if (!postId) {
    if (cost > 0) await adjust(me, cost, "CALL 실패 환불").catch(() => null);
    return { error: cost > 0 ? "글을 다시 올리지 못했어요. 크레딧은 돌려 드렸어요." : "글을 다시 올리지 못했어요." } as const;
  }
  const call = await sql`insert into calls (caller, post_id, source_post_id, radius_km, caller_lat, caller_lng, depart_at) values (${me}, ${postId}, ${sourcePostId}, ${radiusKm}, ${lat}, ${lng}, ${departAt.toISOString()}) returning id`;
  const callId = String(call[0].id);
  await sql`insert into call_recipients (call_id, user_id) select ${callId}, unnest(${ids}::uuid[]) on conflict do nothing`;
  // 그 시각 ±30분에 운전 글(1회 출발 시각 또는 정기 출근·퇴근 시각·요일)이 있는 운전자 = '시간도 맞아요'
  const k = new Date(departAt.getTime() + 9 * 3600_000);
  const minOfDay = k.getUTCHours() * 60 + k.getUTCMinutes();
  const dow = String(k.getUTCDay());
  const win = CALL_TIME_MATCH_MIN;
  const timed = await sql`select distinct p.user_id from posts p
    where p.user_id = any(${ids}::uuid[]) and p.role = 'driver' and p.status = 'open' and (
      (not coalesce(p.regular, false) and p.depart_at between ${new Date(departAt.getTime() - win * 60_000).toISOString()} and ${new Date(departAt.getTime() + win * 60_000).toISOString()})
      or (coalesce(p.regular, false) and position(${dow} in coalesce(p.days, '')) > 0 and exists (
        select 1 from unnest(array[p.time_go, p.time_back]) t(v)
        where v ~ '^[0-9]{1,2}:[0-9]{2}$'
          and least(abs((split_part(v, ':', 1)::int * 60 + split_part(v, ':', 2)::int) - ${minOfDay}),
                    1440 - abs((split_part(v, ':', 1)::int * 60 + split_part(v, ':', 2)::int) - ${minOfDay})) <= ${win})))`;
  const timedSet = new Set(timed.map((r) => String(r.user_id)));
  const at = hmKo(departAt);
  await Promise.all(ids.map((id) => {
    const fit = timedSet.has(id);
    const title = fit ? "시간도 맞는 탑승자가 같이 가자고 해요" : "주변 탑승자가 같이 갈 분을 찾아요";
    const body = pushText.cut(`${at} 출발 · ${origin} → ${dest} · 수락하면 연락처가 보여요`, 120);
    return sendPush(id, { title, body, url: `/?call=${callId}`, tag: `call-${callId}` });
  }));
  return { ok: true, callId, notified: ids.length, timeFit: timedSet.size, radiusKm, spent: cost, newPostId: postId } as const;
}

/** 받은 호출 한 건(받은 회원에게만) */
export async function incomingCall(me: string, callId: string) {
  const rows = await db()`select c.id, p.origin, p.dest, u.member_code, u.contact_type, c.depart_at,
      (c.ended_at is not null or (c.depart_at is not null and c.depart_at < now())) as ended,
      exists(select 1 from call_accepts a where a.call_id = c.id and a.user_id = ${me}) as accepted
    from calls c join call_recipients r on r.call_id = c.id and r.user_id = ${me}
    join posts p on p.id = c.post_id join users u on u.id = c.caller
    where c.id = ${callId}`;
  if (!rows.length) return null;
  const r = rows[0];
  return { callId, origin: String(r.origin), dest: String(r.dest), callerCode: String(r.member_code ?? ""), accepted: r.accepted === true,
    departAt: r.depart_at ? new Date(r.depart_at as string).getTime() : null, ended: r.ended === true };
}

/** 호출을 받은 회원이 수락하면, 호출자가 등록한 연락 방법과 아이디를 보여 준다. */
export async function acceptCall(me: string, callId: string) {
  const sql = db();
  const rec = await sql`select 1 from call_recipients where call_id = ${callId} and user_id = ${me}`;
  if (!rec.length) return { error: "호출을 받은 회원만 수락할 수 있어요." } as const;
  const live = await sql`select 1 from calls where id = ${callId} and ended_at is null and (depart_at is null or depart_at > now())`;
  if (!live.length) return { error: "이미 끝난 호출이에요." } as const;
  await sql`insert into call_accepts (call_id, user_id) values (${callId}, ${me}) on conflict do nothing`;
  const c = await sql`select u.contact, u.contact_type from calls c join users u on u.id = c.caller where c.id = ${callId}`;
  if (!c.length) return { error: "호출을 찾을 수 없어요." } as const;
  const type = String(c[0].contact_type ?? "");
  const contact = String(c[0].contact ?? "");
  if (!type || !contact) return { error: "호출한 회원의 연락 방법이 없어요." } as const;
  return { ok: true, contactType: contactLabel(type), contact } as const;
}

export type CallHistoryRow = {
  id: string;
  created_at: string;
  radius_km: number;
  origin: string | null;
  dest: string | null;
  recipients: number;
  accepts: number;
  name?: string;
  email?: string;
};

/**
 * CALL 이력 조회. caller 를 주면 그 회원이 보낸 호출만(알림·수락 인원만 보여 준다),
 * 없으면 관리자용 전체 목록(호출자 이름·이메일 포함).
 */
export async function listCalls(opts: { caller?: string; limit: number }): Promise<CallHistoryRow[]> {
  const lim = Math.max(1, Math.min(opts.limit, 500));
  const sql = db();
  if (opts.caller) {
    return (await sql`
      select c.id, c.created_at, c.radius_km, p.origin, p.dest,
        (select count(*)::int from call_recipients r where r.call_id = c.id) as recipients,
        (select count(*)::int from call_accepts a where a.call_id = c.id) as accepts
      from calls c left join posts p on p.id = c.post_id
      where c.caller = ${opts.caller}
      order by c.created_at desc limit ${lim}`) as CallHistoryRow[];
  }
  return (await sql`
    select c.id, c.created_at, c.radius_km, p.origin, p.dest, u.name, u.email,
      (select count(*)::int from call_recipients r where r.call_id = c.id) as recipients,
      (select count(*)::int from call_accepts a where a.call_id = c.id) as accepts
    from calls c join users u on u.id = c.caller left join posts p on p.id = c.post_id
    order by c.created_at desc limit ${lim}`) as CallHistoryRow[];
}

/**
 * 출발 15분 전까지 아무도 수락하지 않은 CALL을 끝내고 보낸 분께 알린다(수락이 있는 호출은 출발 시각이 지나면 조용히 끝냄).
 * GET /api/posts after()에서 1분에 한 번(인스턴스별), 처리할 것이 있을 때만.
 */
let expireTry = 0;
export async function maybeExpireCalls() {
  if (Date.now() - expireTry < 60_000) return;
  expireTry = Date.now();
  const sql = db();
  const gone = await sql`update calls c set ended_at = now()
    where c.ended_at is null and c.depart_at is not null
      and c.depart_at < now() + make_interval(mins => ${CALL_EXPIRE_BEFORE_MIN})
      and not exists (select 1 from call_accepts a where a.call_id = c.id)
    returning c.id, c.caller`;
  for (const g of gone) {
    await sendPush(String(g.caller), { title: "이번엔 함께 갈 분이 없었어요", body: "CALL을 수락한 운전자가 없어 호출을 마쳤어요. 시간을 넉넉히 두고 다시 불러 보세요.", url: "/", tag: `call-${g.id}` });
  }
  await sql`update calls set ended_at = now() where ended_at is null and depart_at is not null and depart_at < now()`;
}
