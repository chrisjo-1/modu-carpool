import { db } from "./server";
import { sendPush, pushText } from "./push";
import { boundingBox, getRadius } from "./radius";
import { callerReady, LOCATION_FRESH_MIN } from "./call";
import { contactLabel } from "./types";

/** 택시동승 호출: 하루(한국 시간) 횟수. CALL 횟수와 따로 센다. 무료. */
export const TAXI_DAILY_LIMIT = 2;
const MAX_RECIPIENTS = 200;

/** 오늘 남은 택시동승 호출 횟수 (한국 시간 자정 기준) */
export async function taxiStatus(me: string) {
  const rows = await db()`select count(*)::int as n from taxi_calls
    where caller = ${me} and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`;
  const used = Number(rows[0]?.n ?? 0);
  return { used, left: Math.max(0, TAXI_DAILY_LIMIT - used), limit: TAXI_DAILY_LIMIT };
}

/**
 * 받을 사람: 운전자·탑승자 모두. 차량 등록은 필요 없다.
 *  1) 최근 1시간 안에 위치를 기록한 회원이 호출 위치 반경 안에 있음
 *  2) 올린 카풀 글(운전자·탑승자 모두)의 출발지나 도착지가 반경 안에 있음
 * 호출자 본인, 차단한 사이, 관리자 차단·테스트 회원, 알림을 끈 회원은 뺀다.
 */
export async function findTaxiRecipients(me: string, lat: number, lng: number, radiusKm: number): Promise<string[]> {
  const box = boundingBox(lat, lng, radiusKm);
  const rows = await db()`
    select u.id as user_id from users u
    where u.id <> ${me} and not u.blocked and not u.test and u.notify
      and not exists (select 1 from blocks k where (k.blocker = u.id and k.blocked = ${me}) or (k.blocker = ${me} and k.blocked = u.id))
      and (
        (u.loc_at is not null and u.loc_at > now() - make_interval(mins => ${LOCATION_FRESH_MIN})
          and u.loc_lat between ${box.minLat} and ${box.maxLat} and u.loc_lng between ${box.minLng} and ${box.maxLng}
          and 6371 * 2 * asin(sqrt(power(sin(radians(u.loc_lat - ${lat}) / 2), 2)
            + cos(radians(${lat})) * cos(radians(u.loc_lat)) * power(sin(radians(u.loc_lng - ${lng}) / 2), 2))) <= ${radiusKm})
        or exists (select 1 from posts p where p.user_id = u.id
          and ((p.origin_lat is not null and 6371 * 2 * asin(sqrt(power(sin(radians(p.origin_lat - ${lat}) / 2), 2)
              + cos(radians(${lat})) * cos(radians(p.origin_lat)) * power(sin(radians(p.origin_lng - ${lng}) / 2), 2))) <= ${radiusKm})
            or (p.dest_lat is not null and 6371 * 2 * asin(sqrt(power(sin(radians(p.dest_lat - ${lat}) / 2), 2)
              + cos(radians(${lat})) * cos(radians(p.dest_lat)) * power(sin(radians(p.dest_lng - ${lng}) / 2), 2))) <= ${radiusKm})))
      )
    limit 500`;
  return rows.map((r) => String(r.user_id)).slice(0, MAX_RECIPIENTS);
}

export type TaxiCallInput = {
  origin: string;
  dest: string;
  departAt: number;
  note: string;
  lat: number;
  lng: number;
};

/**
 * 택시동승 호출. 무료이고 하루 2회. 받는 사람이 없으면 기록하지 않고 알린다.
 * 반경은 관리자가 정한 택시 반경(push_km_taxi)을 쓰고, 사용자에게는 보여 주지 않는다.
 */
export async function createTaxiCall(me: string, v: TaxiCallInput) {
  const sql = db();
  const cr = await callerReady(me);
  if (!cr.ready) return { error: "택시동승 호출을 쓰려면 프로필에서 연락 방법과 아이디를 먼저 등록해 주세요." } as const;
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) {
    return { error: "현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요." } as const;
  }
  if (!v.origin.trim() || !v.dest.trim()) return { error: "출발지와 도착지를 적어 주세요." } as const;
  if (v.note.trim().length < 2) return { error: "동승 조건을 적어 주세요." } as const;
  if (!Number.isFinite(v.departAt) || v.departAt < Date.now() - 5 * 60_000 || v.departAt > Date.now() + 7 * 86_400_000) {
    return { error: "출발 시각을 다시 확인해 주세요." } as const;
  }
  const st = await taxiStatus(me);
  if (st.left <= 0) return { error: `오늘 택시동승 호출은 ${TAXI_DAILY_LIMIT}번까지 쓸 수 있어요. 내일 다시 이용해 주세요.` } as const;
  const radiusKm = await getRadius("taxi");
  const ids = await findTaxiRecipients(me, v.lat, v.lng, radiusKm);
  if (!ids.length) return { error: "근처에 알릴 회원이 없어요. 호출하지 않았어요." } as const;

  const origin = v.origin.trim().slice(0, 100);
  const dest = v.dest.trim().slice(0, 100);
  const note = v.note.trim().slice(0, 200);
  const rows = await sql`insert into taxi_calls (caller, origin, dest, origin_lat, origin_lng, depart_at, note, radius_km)
    values (${me}, ${origin}, ${dest}, ${v.lat}, ${v.lng}, ${new Date(v.departAt).toISOString()}, ${note}, ${radiusKm}) returning id`;
  const callId = String(rows[0].id);
  await sql`insert into taxi_call_recipients (call_id, user_id) select ${callId}, unnest(${ids}::uuid[]) on conflict do nothing`;

  const title = "근처에서 택시동승 상대를 찾고 있어요";
  const body = pushText.cut(`${origin} → ${dest} · ${note}`, 120);
  await Promise.all(ids.map((id) => sendPush(id, { title, body, url: `/?taxicall=${callId}`, tag: `taxicall-${callId}` })));
  return { ok: true, callId, notified: ids.length } as const;
}

/** 받은 택시동승 호출 한 건(받은 회원에게만) */
export async function incomingTaxiCall(me: string, callId: string) {
  const rows = await db()`select c.id, c.origin, c.dest, c.depart_at, c.note, u.member_code,
      exists(select 1 from taxi_call_accepts a where a.call_id = c.id and a.user_id = ${me}) as accepted
    from taxi_calls c join taxi_call_recipients r on r.call_id = c.id and r.user_id = ${me}
    join users u on u.id = c.caller
    where c.id = ${callId}`;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    callId,
    origin: String(r.origin),
    dest: String(r.dest),
    departAt: new Date(r.depart_at as string).getTime(),
    note: String(r.note ?? ""),
    callerCode: String(r.member_code ?? ""),
    accepted: r.accepted === true,
  };
}

/** 받은 회원이 수락하면 호출자의 연락 방법과 아이디를 보여 준다(CALL과 같은 방식). */
export async function acceptTaxiCall(me: string, callId: string) {
  const sql = db();
  const rec = await sql`select 1 from taxi_call_recipients where call_id = ${callId} and user_id = ${me}`;
  if (!rec.length) return { error: "호출을 받은 회원만 수락할 수 있어요." } as const;
  await sql`insert into taxi_call_accepts (call_id, user_id) values (${callId}, ${me}) on conflict do nothing`;
  const c = await sql`select u.contact, u.contact_type from taxi_calls t join users u on u.id = t.caller where t.id = ${callId}`;
  if (!c.length) return { error: "호출을 찾을 수 없어요." } as const;
  const type = String(c[0].contact_type ?? "");
  const contact = String(c[0].contact ?? "");
  if (!type || !contact) return { error: "호출한 회원의 연락 방법이 없어요." } as const;
  return { ok: true, contactType: contactLabel(type), contact } as const;
}
