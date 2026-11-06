import { after } from "next/server";
import { notifySafetyAlert, notifySafetyStart } from "@/lib/safetyNotify";
import { pushEnabled, sendPush } from "@/lib/push";
import { maybeRunSafetyChecks } from "@/lib/safetyJob";
import { normPhone, safetyOpen, SAFETY_INTERVAL_MIN, SAFETY_NIGHT_TEXT, SAFETY_PHOTO_ME, SAFETY_PUSH_ME } from "@/lib/safety";
import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, photoUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 대화방(신청)의 두 사람과 운전자·탑승자, 수락 여부와 경로 정보 */
async function partyOf(requestId: string, me: string) {
  const r = await db()`select r.status, r.user_id as applicant, p.user_id as owner, p.role,
      p.origin, p.dest, p.time_go, p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng
    from requests r join posts p on p.id = r.post_id
    where r.id = ${requestId} and (r.user_id = ${me} or p.user_id = ${me})`;
  if (!r.length) return null;
  const x = r[0];
  const ownerDrives = String(x.role) === "driver";
  const driverId = String(ownerDrives ? x.owner : x.applicant);
  const riderId = String(ownerDrives ? x.applicant : x.owner);
  return {
    accepted: String(x.status) === "accepted",
    driverId,
    riderId,
    other: me === driverId ? riderId : driverId,
    post: {
      origin: String(x.origin), dest: String(x.dest), timeGo: String(x.time_go ?? ""),
      originLat: x.origin_lat == null ? null : Number(x.origin_lat), originLng: x.origin_lng == null ? null : Number(x.origin_lng),
      destLat: x.dest_lat == null ? null : Number(x.dest_lat), destLng: x.dest_lng == null ? null : Number(x.dest_lng),
    },
  };
}

/** 두 사람의 프로필 사진(있는지·상대 사진 주소·이름) */
async function photos(me: string, other: string) {
  const r = await db()`select id, name, photo_v, photo <> '' as has from users where id in (${me}, ${other})`;
  const mine = r.find((x) => String(x.id) === me);
  const o = r.find((x) => String(x.id) === other);
  const has = (x: Record<string, unknown> | undefined) => !!x && (x.has === true || Number(x.photo_v) > 0);
  return { myPhoto: has(mine), otherPhoto: has(o) ? photoUrl(other, o?.photo_v) : "", otherHasPhoto: has(o), otherName: String(o?.name ?? "") };
}
/** 상대에게 사진을 올려 달라는 푸시(같은 대화에서는 알림 하나로 묶임) */
async function askPhoto(other: string, requestId: string) {
  await sendPush(other, { title: "프로필 사진을 올려 주세요", body: "상대분이 안심동행을 하려고 해요. 서로 얼굴을 확인할 수 있게 프로필 사진을 올려 주세요.", url: `/?room=${requestId}`, tag: `safety-photo-${requestId}` }).catch(() => 0);
}

const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
/** 화면에 보내는 모양(전화번호는 돌려주지 않는다. 등록 여부만) */
function shape(s: Record<string, unknown>, me: string) {
  const isRider = String(s.rider_id) === me;
  return {
    id: String(s.id),
    status: String(s.status),
    result: String(s.result ?? ""),
    startedAt: ms(s.started_at),
    pendingSince: ms(s.pending_since),
    lastAnswer: String(s.last_answer ?? ""),
    isRider,
    iRequested: String(s.requester_id) === me,
    iConsented: String(s.requester_id) === me ? !!s.requester_consent_at : !!s.partner_consent_at,
    otherConsented: String(s.requester_id) === me ? !!s.partner_consent_at : !!s.requester_consent_at,
    phoneSaved: String(s.requester_id) === me ? !!s.requester_phone : !!s.partner_phone,
    urgentAt: ms(s.urgent_at),
    boardedAt: ms(s.boarded_at),
    rearSeat: s.rear_seat === true,
    etaAt: ms(s.eta_at),
    lateAt: ms(s.late_at),
  };
}

/** GET ?req=신청ID → 이 대화의 안심동행 상태(진행 중 건 하나)와 경로 정보 */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const requestId = new URL(req.url).searchParams.get("req") ?? "";
  if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const p = await partyOf(requestId, me);
    if (!p) return json({ error: "대화방을 찾을 수 없어요." }, 404);
    // 안심 체크·무응답 다시 알림·도착 지연은 서버 작업이 처리한다(1분에 한 번). 이 응답에도 바로 반영되게 먼저 돌린다.
    await maybeRunSafetyChecks().catch((e) => console.error("[safety-job]", e));
    const rows = await db()`select * from safety_sessions where request_id = ${requestId} and status <> 'closed' order by created_at desc limit 1`;
    const g = await db()`select gender from users where id = ${me}`;
    return json({ accepted: p.accepted, post: p.post, open: safetyOpen(), ...(await photos(me, p.other)), canStart: String(g[0]?.gender ?? "") === "female", session: rows[0] ? shape(rows[0], me) : null });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST
 * - start {requestId, phone}: 신청자가 전화번호를 내고 시작. 상대에게 동의 요청 푸시.
 * - consent {id, phone}: 상대가 전화번호를 내고 동의 → 둘 다 동의하면 진행 중(active).
 * - board {id, rearSeat, eta}: 탑승자가 [뒷자리에 탔어요]·예상 도착 시각을 정함(탑승자만). eta만 다시 보내면 시각 변경.
 * - ask {id}: 탑승자 앱이 주기 확인을 띄움(탑승자만). 이전 답이 없으면 대기 시작 시각을 기록.
 * - answer {id, answer: yes|no}: 탑승자가 답함.
 * - end {id}: 둘 중 누구나 종료. 전화번호는 지운다.
 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();

    if (b.action === "start") {
      const requestId = String(b.requestId ?? "");
      const phone = normPhone(b.phone);
      if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
      if (!phone) return json({ error: "전화번호를 정확히 입력해 주세요." }, 400);
      if (!safetyOpen()) return json({ error: SAFETY_NIGHT_TEXT }, 403);
      const g = await sql`select gender from users where id = ${me}`;
      if (String(g[0]?.gender ?? "") !== "female") return json({ error: "안심동행은 여성 회원만 신청할 수 있어요." }, 403);
      const p = await partyOf(requestId, me);
      if (!p) return json({ error: "대화방을 찾을 수 없어요." }, 404);
      if (!p.accepted) return json({ error: "수락된 카풀에서만 시작할 수 있어요." }, 400);
      // 신청하는 여성 회원은 본인 사진이 있어야 한다. 상대(운전자) 사진은 동의할 때 등록하게 한다.
      const ph = await photos(me, p.other);
      if (!ph.myPhoto) return json({ error: SAFETY_PHOTO_ME, code: "photo-me" }, 400);
      // 안심 체크는 푸시로 묻기 때문에 알림이 켜진 기기가 하나는 있어야 신청할 수 있다(2026-11-06 사용자 지시)
      if (pushEnabled()) {
        const ps = await sql`select 1 from push_subs where user_id = ${me} and paused_at is null limit 1`;
        if (!ps.length) return json({ error: SAFETY_PUSH_ME, code: "push-off" }, 400);
      }
      const busy = await sql`select 1 from safety_sessions where request_id = ${requestId} and status <> 'closed' limit 1`;
      if (busy.length) return json({ error: "이미 진행 중인 안심동행이 있어요." }, 409);
      const rows = await sql`insert into safety_sessions (request_id, requester_id, partner_id, rider_id, requester_phone, requester_consent_at)
        values (${requestId}, ${me}, ${p.other}, ${p.riderId}, ${phone}, now()) returning *`;
      const info = { requesterId: me, requestId, origin: p.post.origin, dest: p.post.dest, timeGo: p.post.timeGo, requesterIsRider: me === p.riderId };
      after(() => notifySafetyStart(info).catch((e) => console.error("[safety] notify", e)));
      await sendPush(p.other, { title: "안심동행 요청", body: ph.otherHasPhoto ? "상대분이 안심동행을 신청했어요. 도착할 때까지 운영팀이 함께 지켜봐요. 확인하고 동의해 주세요." : "상대분이 안심동행을 신청했어요. 동의하고, 얼굴이 보이는 프로필 사진도 등록해 주세요. 탑승자가 안심해요.", url: `/?room=${requestId}`, tag: `safety-${requestId}` });
      return json({ ok: true, session: shape(rows[0], me) });
    }

    if (b.action === "consent") {
      const id = String(b.id ?? "");
      const phone = normPhone(b.phone);
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      if (!phone) return json({ error: "전화번호를 정확히 입력해 주세요." }, 400);
      if (!safetyOpen()) return json({ error: SAFETY_NIGHT_TEXT }, 403);
      const rows = await sql`update safety_sessions set partner_phone = ${phone}, partner_consent_at = now(),
          status = 'active', started_at = now()
        where id = ${id} and partner_id = ${me} and status = 'pending' and partner_consent_at is null returning *`;
      if (!rows.length) return json({ error: "동의할 수 있는 안심동행이 없어요." }, 409);
      const s = rows[0];
      for (const uid of [String(s.requester_id), String(s.partner_id)]) {
        await sendPush(uid, { title: "안심동행 시작", body: "두 분 모두 동의해 안심동행이 시작됐어요. 탑승하면 [뒷자리에 탔어요]를, 도착하면 [도착했어요]를 눌러 주세요.", url: `/?room=${s.request_id}`, tag: `safety-${s.request_id}` });
      }
      return json({ ok: true, session: shape(s, me) });
    }

    if (b.action === "askPhoto") {
      const requestId = String(b.requestId ?? "");
      if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
      const p = await partyOf(requestId, me);
      if (!p || !p.accepted) return json({ error: "수락된 카풀에서만 알릴 수 있어요." }, 400);
      await askPhoto(p.other, requestId);
      return json({ ok: true });
    }

    if (b.action === "board") {
      const id = String(b.id ?? "");
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const eta = Number(b.eta);
      // 예상 도착 시각: 지금부터 5분~6시간 안
      if (!(eta > Date.now() + 4 * 60_000 && eta < Date.now() + 6 * 3600_000)) return json({ error: "예상 도착 시각을 지금 이후로 골라 주세요." }, 400);
      const etaIso = new Date(eta).toISOString();
      const rows = b.rearSeat === undefined
        ? await sql`update safety_sessions set eta_at = ${etaIso}, late_at = null
            where id = ${id} and rider_id = ${me} and status = 'active' and boarded_at is not null returning *`
        : await sql`update safety_sessions set boarded_at = coalesce(boarded_at, now()), rear_seat = ${b.rearSeat === true}, eta_at = ${etaIso}, late_at = null
            where id = ${id} and rider_id = ${me} and status = 'active' returning *`;
      if (!rows.length) return json({ error: "지금은 탑승 확인을 할 수 없어요." }, 409);
      const s = rows[0];
      const other = String(s.requester_id) === me ? String(s.partner_id) : String(s.requester_id);
      if (b.rearSeat !== undefined) {
        const hm = new Date(eta + 9 * 3600_000).toISOString().slice(11, 16);
        await sendPush(other, { title: "탑승 확인", body: `탑승자가 탑승했어요. 도착 예정 ${hm}. 안전 운전 부탁드려요.`, url: `/?room=${s.request_id}`, tag: `safety-board-${id}` });
      }
      return json({ ok: true, session: shape(s, me) });
    }

    if (b.action === "ask") {
      const id = String(b.id ?? "");
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const rows = await sql`update safety_sessions set pending_since = now(), last_ask_at = now(), reminded_at = null
        where id = ${id} and rider_id = ${me} and status = 'active' and pending_since is null returning *`;
      if (!rows.length) return json({ error: "이미 확인 질문이 떠 있거나 지금은 확인할 수 없어요." }, 409);
      await sendPush(me, { title: "이동 중 확인", body: "이동하는 데 불편함은 없으신가요?", url: `/?room=${rows[0].request_id}`, tag: `safety-ask-${id}` });
      return json({ ok: true, session: shape(rows[0], me), intervalMin: SAFETY_INTERVAL_MIN });
    }

    if (b.action === "answer") {
      const id = String(b.id ?? "");
      const answer = b.answer === "yes" ? "yes" : b.answer === "no" ? "no" : "";
      if (!isUuid(id) || !answer) return json({ error: "잘못된 요청입니다." }, 400);
      const rows = await sql`update safety_sessions set last_answer = ${answer}, last_answer_at = now(), pending_since = null
        where id = ${id} and rider_id = ${me} and status = 'active' and pending_since is not null returning *`;
      if (!rows.length) return json({ error: "지금 답할 확인 질문이 없어요." }, 409);
      if (answer === "no") after(() => notifySafetyAlert("no", id).catch(() => {}));
      return json({ ok: true, session: shape(rows[0], me) });
    }

    if (b.action === "urgent") {
      const id = String(b.id ?? "");
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const rows = await sql`update safety_sessions set urgent_at = coalesce(urgent_at, now())
        where id = ${id} and (requester_id = ${me} or partner_id = ${me}) and status = 'active' returning *`;
      if (!rows.length) return json({ error: "진행 중인 안심동행에서만 보낼 수 있어요." }, 409);
      const s = rows[0];
      const other = String(s.requester_id) === me ? String(s.partner_id) : String(s.requester_id);
      await sendPush(other, { title: "위급 신호", body: "상대분이 위급 신호를 보냈어요. 괜찮으신지 바로 확인해 주세요.", url: `/?room=${s.request_id}`, tag: `safety-urgent-${id}` });
      after(() => notifySafetyAlert("urgent", id).catch(() => {}));
      return json({ ok: true, session: shape(s, me) });
    }

    if (b.action === "end") {
      const id = String(b.id ?? "");
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const rows = await sql`update safety_sessions set status = 'closed', result = 'ended', closed_at = now(),
          requester_phone = '', partner_phone = '', pending_since = null
        where id = ${id} and (requester_id = ${me} or partner_id = ${me}) and status <> 'closed' returning *`;
      if (!rows.length) return json({ error: "종료할 수 있는 안심동행이 없어요." }, 409);
      const s = rows[0];
      // 안심동행 종료 = 카풀 종료로 보고 운전자 연락처도 지운다
      await sql`delete from ride_contacts where request_id = ${s.request_id}`;
      const other = String(s.requester_id) === me ? String(s.partner_id) : String(s.requester_id);
      await sendPush(other, { title: "안심동행 종료", body: String(s.rider_id) === me ? "탑승자가 도착했어요. 안심동행을 마쳤어요. 고맙습니다." : "안심동행이 종료됐어요.", url: `/?room=${s.request_id}`, tag: `safety-${s.request_id}` });
      return json({ ok: true });
    }

    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}
