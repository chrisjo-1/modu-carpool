import { db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";
import { ensureSeatSchema, seatDbReady, seatSql } from "@/lib/seatDb";

export const dynamic = "force-dynamic";

/**
 * 관리자 '출퇴근 지도'용 이동 경로 모음. 이름·이메일·회원 번호는 보내지 않는다.
 * - post: 진행 중인 정기(출퇴근) 카풀 글의 출발→도착
 * - profile: 가입 때 입력한 출퇴근 정보(정기 글이 없는 회원만, 중복 방지)
 * 차단·탈퇴·테스트 회원은 뺀다. 지하철 등록은 좌표가 없어 개수만 돌려준다.
 */
export type Flow = { o: [number, number]; d: [number, number]; origin: string; dest: string; role: "driver" | "rider" | "profile"; time: string };

export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ flows: [], subway: 0 });
  try {
    await ensureSchema();
    const sql = db();
    const posts = await sql`
      select p.user_id, p.role, p.origin, p.dest, p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng, p.time_go
      from posts p join users u on u.id = p.user_id
      where p.regular and p.status in ('open', 'progress')
        and not u.blocked and u.withdrawn_at is null and not u.test
        and p.origin_lat is not null and p.dest_lat is not null
      limit 5000`;
    const withPost = new Set(posts.map((p) => p.user_id as string));
    const profiles = await sql`
      select id, commute_origin, commute_dest, commute_olat, commute_olng, commute_dlat, commute_dlng, commute_time
      from users
      where not blocked and withdrawn_at is null and not test
        and commute_olat is not null and commute_dlat is not null
      limit 20000`;
    const flows: Flow[] = [
      ...posts.map((p) => ({
        o: [Number(p.origin_lat), Number(p.origin_lng)] as [number, number],
        d: [Number(p.dest_lat), Number(p.dest_lng)] as [number, number],
        origin: String(p.origin ?? ""),
        dest: String(p.dest ?? ""),
        role: (p.role === "driver" ? "driver" : "rider") as Flow["role"],
        time: String(p.time_go ?? ""),
      })),
      ...profiles
        .filter((u) => !withPost.has(u.id as string))
        .map((u) => ({
          o: [Number(u.commute_olat), Number(u.commute_olng)] as [number, number],
          d: [Number(u.commute_dlat), Number(u.commute_dlng)] as [number, number],
          origin: String(u.commute_origin ?? ""),
          dest: String(u.commute_dest ?? ""),
          role: "profile" as const,
          time: String(u.commute_time ?? ""),
        })),
    ].filter((f) => f.o.every(Number.isFinite) && f.d.every(Number.isFinite));

    let subway = 0;
    if (seatDbReady()) {
      try {
        await ensureSeatSchema();
        const r = await seatSql()`select count(*)::int as n from seat_plans`;
        subway = Number(r[0]?.n ?? 0);
      } catch {
        /* 지하철 DB가 없어도 지도는 보여 준다 */
      }
    }
    return json({ flows, subway });
  } catch (e) {
    return fail(e);
  }
}
