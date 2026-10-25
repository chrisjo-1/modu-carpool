import { cleanConfig } from "@/lib/counsel";
import { getCounselConfig, saveCounselConfig } from "@/lib/counselDb";
import { body, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);
const STATUSES = ["pending", "confirmed", "done", "canceled"];

/** 관리자: 상담 시간 설정과 예약 목록(최근 200건). status로 거를 수 있다. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const status = new URL(req.url).searchParams.get("status") ?? "";
  try {
    await ensureSchema();
    const sql = db();
    const filter = STATUSES.includes(status) ? status : "";
    const [config, items, counts] = await Promise.all([
      getCounselConfig(),
      sql`select b.id, b.topic, b.mind_index, b.level, b.crisis, extract(epoch from b.slot_at)::bigint * 1000 as slot_at, b.method, b.contact, b.note, b.status, b.admin_memo,
          extract(epoch from b.created_at)::bigint * 1000 as created_at, coalesce(u.email, b.guest_email, '') as email, coalesce(u.member_code, '비회원') as member_code
        from counsel_bookings b left join users u on u.id = b.user_id
        where (${filter} = '' or b.status = ${filter})
        order by (b.status in ('pending', 'confirmed') and b.slot_at > now() - interval '2 hours') desc, b.slot_at asc
        limit 200`,
      sql`select status, count(*)::int as n from counsel_bookings group by status`,
    ]);
    return json({ config, items, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 상담 가능 시간 설정 저장 */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  try {
    await ensureSchema();
    const c = cleanConfig(b.config);
    await saveCounselConfig(c);
    return json({ config: c });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 예약 상태·메모 바꾸기 {id, status?, memo?} */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  if (!isUuid(b.id)) return json({ error: "잘못된 요청입니다." }, 400);
  const status = STATUSES.includes(String(b.status)) ? String(b.status) : null;
  const memo = typeof b.memo === "string" ? text(b.memo, 500) : null;
  try {
    await ensureSchema();
    const r = await db()`update counsel_bookings set status = coalesce(${status}, status), admin_memo = coalesce(${memo}, admin_memo)
      where id = ${b.id} returning id`;
    if (!r.length) return json({ error: "예약을 찾지 못했어요." }, 404);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
