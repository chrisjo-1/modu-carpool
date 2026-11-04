import { logOps } from "@/lib/opsLog";
import { SAFETY_OVERDUE_MIN } from "@/lib/safety";
import { body, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);

/** 관리자: 진행 중 안전지킴(전화번호 포함) + 최근 종료 20건. 3분 넘게 답 없는 건(overdue)과 '아니오' 응답을 표시. */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`select s.*, p.origin, p.dest, p.time_go,
        exists (select 1 from ride_contacts rc where rc.request_id = s.request_id) as ride_contact,
        ru.email as rider_email, ru.name as rider_nick, ru.member_code as rider_code,
        du.email as driver_email, du.name as driver_nick, du.member_code as driver_code
      from safety_sessions s
      join requests r on r.id = s.request_id
      join posts p on p.id = r.post_id
      left join users ru on ru.id = s.rider_id
      left join users du on du.id = (case when s.rider_id = s.requester_id then s.partner_id else s.requester_id end)
      where s.status = 'active' or s.created_at > now() - interval '3 days'
      order by (s.status = 'active') desc, s.created_at desc
      limit 60`;
    const now = Date.now();
    const items = rows.map((s) => {
      const pendingSince = ms(s.pending_since);
      const overdue = pendingSince != null && now - pendingSince > SAFETY_OVERDUE_MIN * 60_000;
      return {
        id: String(s.id),
        status: String(s.status),
        result: String(s.result ?? ""),
        origin: String(s.origin),
        dest: String(s.dest),
        timeGo: String(s.time_go ?? ""),
        requesterIsRider: String(s.requester_id) === String(s.rider_id),
        rider: { nick: String(s.rider_nick ?? ""), code: String(s.rider_code ?? ""), email: String(s.rider_email ?? ""), phone: String(s.rider_id) === String(s.requester_id) ? String(s.requester_phone ?? "") : String(s.partner_phone ?? "") },
        driver: { nick: String(s.driver_nick ?? ""), code: String(s.driver_code ?? ""), email: String(s.driver_email ?? ""), phone: String(s.rider_id) === String(s.requester_id) ? String(s.partner_phone ?? "") : String(s.requester_phone ?? "") },
        startedAt: ms(s.started_at),
        closedAt: ms(s.closed_at),
        pendingSince,
        overdue,
        lastAnswer: String(s.last_answer ?? ""),
        lastAnswerAt: ms(s.last_answer_at),
        createdAt: ms(s.created_at),
        requestId: String(s.request_id),
        urgentAt: ms(s.urgent_at),
        rideContact: s.ride_contact === true,
      };
    });
    return json({ items });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 처리 결과 기록 후 종료. 결과 ok(이상 없음)·issue(문제 있음)·unreachable(연락 안 됨). 전화번호는 지운다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const id = String(b.id ?? "");
  const result = ["ok", "issue", "unreachable"].includes(String(b.result)) ? String(b.result) : "";
  if (!isUuid(id) || !result) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const rows = await db()`update safety_sessions set status = 'closed', result = ${result}, closed_at = now(),
        requester_phone = '', partner_phone = '', pending_since = null
      where id = ${id} and status <> 'closed' returning id`;
    if (!rows.length) return json({ error: "이미 처리된 건이에요." }, 409);
    const label = result === "ok" ? "이상 없음" : result === "issue" ? "문제 있음" : "연락 안 됨";
    await logOps("admin", `안전지킴 처리: ${label}`, `건 ${id.slice(0, 8)}`);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
