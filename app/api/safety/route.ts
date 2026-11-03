import { after } from "next/server";
import { notifySafetyStart } from "@/lib/safetyNotify";
import { sendPush } from "@/lib/push";
import { normPhone, SAFETY_INTERVAL_MIN } from "@/lib/safety";
import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

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
  };
}

/** GET ?req=신청ID → 이 대화의 안전지킴 상태(진행 중 건 하나)와 경로 정보 */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const requestId = new URL(req.url).searchParams.get("req") ?? "";
  if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const p = await partyOf(requestId, me);
    if (!p) return json({ error: "대화방을 찾을 수 없어요." }, 404);
    const rows = await db()`select * from safety_sessions where request_id = ${requestId} and status <> 'closed' order by created_at desc limit 1`;
    return json({ accepted: p.accepted, post: p.post, session: rows[0] ? shape(rows[0], me) : null });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST
 * - start {requestId, phone}: 신청자가 전화번호를 내고 시작. 상대에게 동의 요청 푸시.
 * - consent {id, phone}: 상대가 전화번호를 내고 동의 → 둘 다 동의하면 진행 중(active).
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
      const p = await partyOf(requestId, me);
      if (!p) return json({ error: "대화방을 찾을 수 없어요." }, 404);
      if (!p.accepted) return json({ error: "수락된 카풀에서만 시작할 수 있어요." }, 400);
      const busy = await sql`select 1 from safety_sessions where request_id = ${requestId} and status <> 'closed' limit 1`;
      if (busy.length) return json({ error: "이미 진행 중인 안전지킴이 있어요." }, 409);
      const rows = await sql`insert into safety_sessions (request_id, requester_id, partner_id, rider_id, requester_phone, requester_consent_at)
        values (${requestId}, ${me}, ${p.other}, ${p.riderId}, ${phone}, now()) returning *`;
      const info = { requesterId: me, requestId, origin: p.post.origin, dest: p.post.dest, timeGo: p.post.timeGo, requesterIsRider: me === p.riderId };
      after(() => notifySafetyStart(info).catch((e) => console.error("[safety] notify", e)));
      await sendPush(p.other, { title: "안전지킴 요청", body: "상대분이 안전지킴을 신청했어요. 전화번호를 입력하고 동의해 주세요.", url: `/?room=${requestId}`, tag: `safety-${requestId}` });
      return json({ ok: true, session: shape(rows[0], me) });
    }

    if (b.action === "consent") {
      const id = String(b.id ?? "");
      const phone = normPhone(b.phone);
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      if (!phone) return json({ error: "전화번호를 정확히 입력해 주세요." }, 400);
      const rows = await sql`update safety_sessions set partner_phone = ${phone}, partner_consent_at = now(),
          status = 'active', started_at = now()
        where id = ${id} and partner_id = ${me} and status = 'pending' and partner_consent_at is null returning *`;
      if (!rows.length) return json({ error: "동의할 수 있는 안전지킴이 없어요." }, 409);
      const s = rows[0];
      for (const uid of [String(s.requester_id), String(s.partner_id)]) {
        await sendPush(uid, { title: "안전지킴 시작", body: "두 분 모두 동의해 안전지킴이 시작됐어요. 탑승자께는 이동 중 확인 질문이 가요.", url: `/?room=${s.request_id}`, tag: `safety-${s.request_id}` });
      }
      return json({ ok: true, session: shape(s, me) });
    }

    if (b.action === "ask") {
      const id = String(b.id ?? "");
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const rows = await sql`update safety_sessions set pending_since = now()
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
      return json({ ok: true, session: shape(rows[0], me) });
    }

    if (b.action === "end") {
      const id = String(b.id ?? "");
      if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const rows = await sql`update safety_sessions set status = 'closed', result = 'ended', closed_at = now(),
          requester_phone = '', partner_phone = '', pending_since = null
        where id = ${id} and (requester_id = ${me} or partner_id = ${me}) and status <> 'closed' returning *`;
      if (!rows.length) return json({ error: "종료할 수 있는 안전지킴이 없어요." }, 409);
      const s = rows[0];
      const other = String(s.requester_id) === me ? String(s.partner_id) : String(s.requester_id);
      await sendPush(other, { title: "안전지킴 종료", body: "안전지킴이 종료됐어요.", url: `/?room=${s.request_id}`, tag: `safety-${s.request_id}` });
      return json({ ok: true });
    }

    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}
