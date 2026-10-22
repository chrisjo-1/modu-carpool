import { db, fail, hasDb, isAdmin, json } from "@/lib/server";
import { ensureSeatSchema, seatDbReady, seatSql } from "@/lib/seatDb";

export const dynamic = "force-dynamic";

/**
 * 관리자 > 지하철: 지금 활성인 지하철 등록 전체(해제한 등록 제외)와 노선별 인원.
 * 닉네임·이메일은 본 DB(users)에서 붙인다. 등록이 없는 회원·탈퇴 회원은 이름을 비워 둔다.
 */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    await ensureSeatSchema();
    const rows = await seatSql()`select id, user_id, board_line, board_station, alight_line, alight_station, back, created_at, updated_at
      from seat_plans where status = 'active' order by updated_at desc limit 1000`;
    const ids = [...new Set(rows.map((r) => String(r.user_id)))];
    const users = new Map<string, { name: string; email: string; test: boolean }>();
    if (ids.length && hasDb()) {
      const us = await db()`select id, name, email, coalesce(test, false) as test from users where id::text = any(${ids})`;
      for (const u of us) users.set(String(u.id), { name: String(u.name ?? ""), email: String(u.email ?? ""), test: Boolean(u.test) });
    }
    const plans = rows.map((r) => {
      const u = users.get(String(r.user_id));
      return {
        id: Number(r.id),
        userId: String(r.user_id),
        name: u?.name ?? "",
        email: u?.email ?? "",
        test: u?.test ?? false,
        boardLine: String(r.board_line),
        board: String(r.board_station),
        alightLine: String(r.alight_line),
        alight: String(r.alight_station),
        back: Boolean(r.back),
        createdAt: new Date(r.created_at as string).toISOString(),
        updatedAt: new Date(r.updated_at as string).toISOString(),
      };
    });
    // 노선별 인원: 승차 노선 기준(갈아타는 등록은 하차 노선에도 센다).
    const byLine: Record<string, number> = {};
    for (const p of plans) {
      byLine[p.boardLine] = (byLine[p.boardLine] ?? 0) + 1;
      if (p.alightLine !== p.boardLine) byLine[p.alightLine] = (byLine[p.alightLine] ?? 0) + 1;
    }
    return json({ total: plans.length, byLine, plans });
  } catch (e) {
    return fail(e);
  }
}
