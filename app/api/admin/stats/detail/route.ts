import { db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 관리자 통계 타일을 누르면 그 숫자의 실제 데이터를 돌려준다. 테스트 회원은 뺀다. 읽기만 한다. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const key = new URL(req.url).searchParams.get("key") ?? "";
  try {
    await ensureSchema();
    const sql = db();
    const LIMIT = 300;
    let rows: Record<string, unknown>[];
    switch (key) {
      case "users":
        rows = await sql`select u.member_code, u.name, u.email, u.created_at, u.last_seen from users u
          where not u.test order by u.created_at desc limit ${LIMIT}`;
        break;
      case "verified":
        rows = await sql`select u.member_code, u.name, u.email, u.created_at from users u
          where not u.test and u.email_verified order by u.created_at desc limit ${LIMIT}`;
        break;
      case "marketing":
        rows = await sql`select u.member_code, u.name, u.email, u.marketing_at from users u
          where not u.test and u.marketing order by u.marketing_at desc nulls last limit ${LIMIT}`;
        break;
      case "push":
        rows = await sql`select u.member_code, u.name, u.email,
            (select count(*)::int from push_subs s where s.user_id = u.id) as devices
          from users u where not u.test and exists (select 1 from push_subs s where s.user_id = u.id)
          order by u.member_code limit ${LIMIT}`;
        break;
      case "live":
        rows = await sql`select p.role, p.origin, p.dest, p.regular, p.days, p.time_go, p.depart_at, u.member_code, u.email
          from posts p join users u on u.id = p.user_id
          where not u.test and p.status = 'open' and (p.regular or p.depart_at > now())
          order by p.depart_at limit ${LIMIT}`;
        break;
      case "accepted":
        rows = await sql`select r.created_at, p.origin, p.dest, ou.member_code as owner, ou.email as owner_email,
            ru.member_code as requester, ru.email as requester_email
          from requests r join posts p on p.id = r.post_id
          join users ou on ou.id = p.user_id join users ru on ru.id = r.user_id
          where not ou.test and not ru.test and r.status = 'accepted'
          order by r.created_at desc limit ${LIMIT}`;
        break;
      case "alerts":
        // 경로 좌표는 보여 주지 않는다(라벨과 조건만).
        rows = await sql`select a.created_at, a.label, a.want, u.member_code, u.email
          from route_alerts a join users u on u.id = a.user_id
          where not u.test order by a.created_at desc limit ${LIMIT}`;
        break;
      case "legacy":
        rows = await sql`select l.warp_id, l.name, l.status, l.match_status, u.member_code, u.email
          from legacy_members l join users u on u.id = l.matched_user
          where l.matched_user is not null and not u.test order by l.warp_id limit ${LIMIT}`;
        break;
      default:
        return json({ error: "알 수 없는 항목입니다." }, 400);
    }
    return json({ key, rows, limit: LIMIT });
  } catch (e) {
    return fail(e);
  }
}
