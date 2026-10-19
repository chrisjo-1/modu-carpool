import { db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 관리자: 카풀 신청 목록(?status=pending|accepted|declined, 최근 200건) */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const st = new URL(req.url).searchParams.get("status") ?? "";
  const status = ["pending", "accepted", "declined"].includes(st) ? st : "";
  try {
    await ensureSchema();
    const rows = await db()`
      select r.id, r.status, r.created_at, r.message,
             p.origin, p.dest, p.role, p.regular, p.depart_at, p.days, p.time_go,
             a.name as req_name, a.email as req_email, a.test as req_test,
             o.name as owner_name, o.email as owner_email,
             count(*) over () as total
      from requests r
      join posts p on p.id = r.post_id
      join users a on a.id = r.user_id
      join users o on o.id = p.user_id
      where (${status} = '' or r.status = ${status})
      order by r.created_at desc
      limit 200`;
    return json({
      total: rows.length ? Number(rows[0].total) : 0,
      rows: rows.map((r) => ({
        id: r.id, status: r.status, message: r.message, origin: r.origin, dest: r.dest, role: r.role, regular: r.regular,
        days: r.days, time_go: r.time_go, depart_at: new Date(r.depart_at as string).getTime(), created_at: new Date(r.created_at as string).getTime(),
        req_name: r.req_name, req_email: r.req_email, req_test: r.req_test, owner_name: r.owner_name, owner_email: r.owner_email,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
