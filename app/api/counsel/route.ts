import { after } from "next/server";
import { TOPICS, looksLikePhone, openSlots, scoreAnswers, type Method, type Topic } from "@/lib/counsel";
import { getCounselConfig, notifyAdminsOfBooking, sendBookingReceipt } from "@/lib/counselDb";
import { body, clientIp, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin, overLimit, recordAttempt, text } from "@/lib/server";

export const dynamic = "force-dynamic";

const METHODS: Method[] = ["kakao", "instagram", "sns", "email"];

/** 마음 상담: 열린 시각과 내 예약(로그인 시) */
export async function GET() {
  try {
    await ensureSchema();
    const [config, uid] = await Promise.all([getCounselConfig(), currentUserId()]);
    let mine: Record<string, unknown> | null = null;
    if (uid) {
      const r = await db()`select id, topic, extract(epoch from slot_at)::bigint * 1000 as slot_at, method, status
        from counsel_bookings where user_id = ${uid} and status in ('pending', 'confirmed') and slot_at > now() - interval '2 hours'
        order by slot_at limit 1`;
      if (r.length) mine = { id: r[0].id, topic: r[0].topic, slotAt: Number(r[0].slot_at), method: r[0].method, status: r[0].status };
    }
    return json({ on: config.on, slots: openSlots(config), mine, loggedIn: !!uid });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const b = await body(req);
  try {
    await ensureSchema();
    const uid = await currentUserId();
    if (b.action === "cancel") return uid ? cancel(uid, b.id) : needLogin();
    // 예약은 회원가입 없이도 된다(비회원은 user_id 없이 남긴 연락처로 연락)
    if (b.action === "book") return book(uid, b, clientIp(req));
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function book(uid: string | null, b: Record<string, unknown>, ip: string) {
  if (b.consent !== true) return json({ error: "민감정보 수집·이용에 동의해 주세요." }, 400);
  const topic = TOPICS.some((t) => t.id === b.topic) ? (b.topic as Topic) : null;
  if (!topic) return json({ error: "상담 유형을 골라 주세요." }, 400);
  // 점수는 서버에서 다시 계산한다. 응답 원문은 저장하지 않는다.
  const res = scoreAnswers(topic, b.answers);
  if (!res) return json({ error: "질문에 모두 답해 주세요." }, 400);
  const method = METHODS.includes(b.method as Method) ? (b.method as Method) : null;
  if (!method) return json({ error: "연락 방법을 골라 주세요." }, 400);
  const contact = text(b.contact, 60);
  if (method !== "email" && !contact) return json({ error: "연락받을 SNS 아이디를 적어 주세요." }, 400);
  // 전화번호는 받지 않는다(비밀 보장)
  if (looksLikePhone(contact)) return json({ error: "전화번호는 받지 않아요. 카카오톡·인스타그램 등 SNS 아이디를 적어 주세요." }, 400);
  const note = text(b.note, 300);
  if (/01[016789][\s-]?\d{3,4}[\s-]?\d{4}/.test(note)) return json({ error: "남긴 말에 전화번호는 적지 말아 주세요. 비밀을 지키기 위해 받지 않아요." }, 400);
  // 비회원이 메일로 연락받겠다면 메일 주소를 받는다
  const guestEmail = !uid && method === "email" ? text(b.email, 120).toLowerCase() : "";
  if (!uid && method === "email" && !EMAIL.test(guestEmail)) return json({ error: "연락받을 메일 주소를 적어 주세요." }, 400);
  const slotAt = Number(b.slot);
  // 회원은 하루 5번, 비회원은 같은 접속처에서 하루 3번까지
  const limitKey = uid ? ["counsel-book", uid, 5] as const : ["counsel-guest", ip, 3] as const;
  if (await overLimit(limitKey[0], limitKey[1], limitKey[2], 60 * 24)) return json({ error: "오늘은 예약을 더 할 수 없어요. 내일 다시 시도해 주세요." }, 429);

  const sql = db();
  if (uid) {
    const active = await sql`select 1 from counsel_bookings where user_id = ${uid} and status in ('pending', 'confirmed') and slot_at > now()`;
    if (active.length) return json({ error: "이미 예약한 상담이 있어요. 기존 예약을 취소한 뒤 다시 예약해 주세요." }, 400);
  }
  const config = await getCounselConfig();
  if (!openSlots(config).includes(slotAt)) return json({ error: "고른 시간은 지금 예약할 수 없어요. 다른 시간을 골라 주세요." }, 409);

  await recordAttempt(limitKey[0], limitKey[1]);
  const inserted = await sql`insert into counsel_bookings (user_id, topic, scale, score, max_score, mind_index, level, crisis, slot_at, method, contact, note, consent_at, guest_email)
    values (${uid}, ${topic}, ${res.scale}, ${res.score}, ${res.max}, ${res.index}, ${res.level}, ${res.crisis}, to_timestamp(${slotAt / 1000}), ${method}, ${method === "email" ? "" : contact}, ${note}, now(), ${guestEmail})
    returning id`;
  const u = uid ? await sql`select email, coalesce(member_code, '') as member_code from users where id = ${uid}` : [];
  const mailTo = uid ? String(u[0]?.email ?? "") : guestEmail;
  const info = { topic, index: res.index, level: res.level, crisis: res.crisis, slotAt, method, contact: method === "email" ? mailTo : contact, note, memberCode: uid ? String(u[0]?.member_code ?? "") : "비회원" };
  after(async () => {
    await notifyAdminsOfBooking(info);
    // 접수 확인 메일: 회원은 가입 메일, 비회원은 메일 주소를 남긴 경우만
    if (mailTo) await sendBookingReceipt(mailTo, uid, info);
  });
  return json({ ok: true, id: inserted[0].id, slotAt });
}

async function cancel(uid: string, id: unknown) {
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  const r = await db()`update counsel_bookings set status = 'canceled' where id = ${id} and user_id = ${uid} and status in ('pending', 'confirmed') returning id`;
  if (!r.length) return json({ error: "취소할 예약을 찾지 못했어요." }, 404);
  return json({ ok: true });
}
