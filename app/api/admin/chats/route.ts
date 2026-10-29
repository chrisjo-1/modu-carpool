import { body, clientIp, db, ensureSchema, fail, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 관리자 채팅 열람(2026-10-29 사용자 지시: 신고가 없어도 문제 확인이 가능해야 함).
 * - GET ?q=검색어: 회원(이메일·닉네임·회원번호)을 찾아 그 회원의 카풀 대화방 목록(내용 없음)
 * - GET ?log=1: 최근 열람 기록
 * - POST {requestId, reason}: 사유를 받아 기록(chat_access_log)을 남긴 뒤 대화 내용을 돌려준다
 * 처리방침 '채팅 확인:' 줄과 대화방 안내(C410)로 회원에게 알린다.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const sql = db();
    const p = new URL(req.url).searchParams;
    if (p.get("log")) {
      const rows = await sql`select l.id, l.request_id, l.reason, l.ip, l.at, p.origin, p.dest, a.name as a_name, b.name as b_name
        from chat_access_log l
        left join requests q on q.id = l.request_id
        left join posts p on p.id = q.post_id
        left join users a on a.id = q.user_id
        left join users b on b.id = p.user_id
        order by l.at desc limit 50`;
      return json({
        log: rows.map((r) => ({
          id: String(r.id), requestId: String(r.request_id), reason: String(r.reason), ip: String(r.ip ?? ""),
          at: new Date(r.at as string).getTime(), route: r.origin ? `${r.origin} → ${r.dest}` : "(삭제된 대화)",
          people: [r.a_name, r.b_name].filter(Boolean).join(" · "),
        })),
      });
    }
    const q = text(p.get("q"), 60).trim();
    if (q.length < 2) return json({ threads: [] });
    const like = `%${q}%`;
    const users = await sql`select id from users where email ilike ${like} or name ilike ${like} or member_code ilike ${like} limit 5`;
    const ids = users.map((u) => String(u.id));
    if (!ids.length) return json({ threads: [] });
    const rows = await sql`
      select q.id, q.status, q.created_at, p.origin, p.dest, p.role,
        ru.name as r_name, ru.email as r_email, ru.member_code as r_code,
        ou.name as o_name, ou.email as o_email, ou.member_code as o_code,
        (select count(*) from messages m where m.request_id = q.id) as n,
        (select max(m.created_at) from messages m where m.request_id = q.id) as last_at
      from requests q join posts p on p.id = q.post_id
      join users ru on ru.id = q.user_id join users ou on ou.id = p.user_id
      where q.user_id = any(${ids}::uuid[]) or p.user_id = any(${ids}::uuid[])
      order by coalesce((select max(m.created_at) from messages m where m.request_id = q.id), q.created_at) desc
      limit 60`;
    return json({
      threads: rows.map((r) => ({
        id: String(r.id), status: String(r.status), route: `${r.origin} → ${r.dest}`, postRole: String(r.role),
        applicant: { name: String(r.r_name ?? ""), email: String(r.r_email ?? ""), code: String(r.r_code ?? "") },
        owner: { name: String(r.o_name ?? ""), email: String(r.o_email ?? ""), code: String(r.o_code ?? "") },
        count: Number(r.n) || 0,
        lastAt: r.last_at ? new Date(r.last_at as string).getTime() : new Date(r.created_at as string).getTime(),
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const b = await body(req);
  const requestId = typeof b.requestId === "string" ? b.requestId : "";
  const reason = text(b.reason, 200).trim();
  if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
  if (reason.length < 2) return json({ error: "열람 사유를 적어 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const rq = await sql`select q.id, q.user_id, q.message, q.created_at, p.user_id as owner, p.origin, p.dest from requests q join posts p on p.id = q.post_id where q.id = ${requestId}`;
    if (!rq.length) return json({ error: "대화를 찾을 수 없습니다." }, 404);
    await sql`insert into chat_access_log (request_id, reason, ip) values (${requestId}, ${reason}, ${clientIp(req)})`;
    const r = rq[0];
    const msgs = await sql`select m.id, m.user_id, m.body, (m.image <> '') as has_image, m.created_at, u.name
      from messages m join users u on u.id = m.user_id where m.request_id = ${requestId} order by m.created_at, m.id limit 1000`;
    return json({
      route: `${r.origin} → ${r.dest}`,
      first: String(r.message ?? ""),
      firstAt: new Date(r.created_at as string).getTime(),
      messages: msgs.map((m) => ({
        id: String(m.id),
        from: String(m.user_id) === String(r.user_id) ? "applicant" : String(m.user_id) === String(r.owner) ? "owner" : "other",
        name: String(m.name ?? ""),
        body: String(m.body ?? ""),
        hasImage: m.has_image === true,
        at: new Date(m.created_at as string).getTime(),
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
