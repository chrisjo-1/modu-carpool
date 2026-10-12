import { clientIp, db, ensureSchema, fail, isAdmin, isUuid, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 신고된 대화 열람(관리자 전용). 신고한 회원과 신고당한 회원 사이의 카풀 대화만 보여 주며,
 * 열람할 때마다 기록(report_chat_access)을 남긴다. 판단 목적 외 열람은 금지.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const reportId = new URL(req.url).searchParams.get("reportId");
  if (!isUuid(reportId) || !reportId) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const rep = await sql`select id, reporter, target, request_id, reason, created_at from reports where id = ${reportId}`;
    if (!rep.length) return json({ error: "신고를 찾을 수 없습니다." }, 404);
    const r = rep[0];
    // 신고에 대화가 연결돼 있으면 그 대화만, 없으면 두 회원 사이의 모든 카풀 대화
    const reqs = r.request_id
      ? await sql`select id from requests where id = ${r.request_id}`
      : await sql`select q.id from requests q join posts p on p.id = q.post_id
          where (q.user_id = ${r.reporter} and p.user_id = ${r.target}) or (q.user_id = ${r.target} and p.user_id = ${r.reporter})`;
    const ids = reqs.map((x) => String(x.id));
    await sql`insert into report_chat_access (report_id, ip) values (${reportId}, ${clientIp(req)})`;
    const msgs = ids.length
      ? await sql`select m.id, m.user_id, m.body, (m.image <> '') as has_image, m.created_at, u.name, u.email
          from messages m join users u on u.id = m.user_id
          where m.request_id = any(${ids}::uuid[]) order by m.created_at, m.id limit 500`
      : [];
    return json({
      reason: String(r.reason),
      reporter: String(r.reporter),
      target: String(r.target),
      messages: msgs.map((m) => ({
        id: String(m.id),
        from: String(m.user_id) === String(r.reporter) ? "reporter" : String(m.user_id) === String(r.target) ? "target" : "other",
        name: String(m.name ?? ""),
        email: String(m.email ?? ""),
        body: String(m.body ?? ""),
        hasImage: m.has_image === true,
        at: new Date(m.created_at as string).getTime(),
      })),
    });
  } catch (e) {
    return fail(e);
  }
}


