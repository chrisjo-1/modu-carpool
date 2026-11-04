import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 관리자 '워프동기화' 탭(2026-11-04 사용자 지시): 화면(사진)에서 확인한 워프 글을 모아 두고,
 * [목록에 추가]를 눌러야만 워프 정기카풀 목록(warp_pools)에 넣는다. 스크린샷 원본은 저장하지 않는다.
 * GET  : 모아 둔 글 + 상태(이미 있음 · 계정 있음 · 계정 없음(대기) · 탈퇴·정지)
 * POST : action = save(붙여넣기 여러 줄) | add(목록에 추가) | status(보류·제외·되돌리기) | delete
 */

const WARP_ID = /^[0-9]{7}[A-Z0-9]$/;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROLE = (s: string) => (/운전|driver/i.test(s) ? "driver" : /탑승|rider/i.test(s) ? "rider" : "");

export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`select s.warp_id, s.role, s.home, s.work, s.time_go, s.reg_date, s.status, s.added_at,
        exists(select 1 from warp_pools p where upper(p.warp_id) = upper(s.warp_id)) as in_pool,
        l.email_norm, u.id as user_id, u.withdrawn_at, u.blocked
      from warp_sync_items s
      left join lateral (select email_norm, matched_user from legacy_members x where upper(x.warp_id) = upper(s.warp_id) limit 1) l on true
      left join users u on u.id = l.matched_user
      order by s.reg_date desc, s.warp_id`;
    const items = rows.map((r) => {
      const gone = !!(r.withdrawn_at || r.blocked);
      const hasAccount = !!r.user_id || !!r.email_norm;
      const label = r.in_pool ? "이미 있음" : r.added_at ? "목록에 추가됨" : gone ? "탈퇴·정지" : hasAccount ? "계정 있음" : "계정 없음(대기)";
      return {
        warpId: String(r.warp_id), role: String(r.role), home: String(r.home), work: String(r.work),
        timeGo: String(r.time_go), regDate: String(r.reg_date), status: String(r.status),
        added: !!r.added_at, inPool: !!r.in_pool, hasAccount, gone, label,
        canAdd: !r.in_pool && !r.added_at && r.status === "new" && !gone,
      };
    });
    return json({ items });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const sql = db();
    const b = await body(req);
    const ids: string[] = Array.isArray(b.ids) ? b.ids.map((x: unknown) => String(x).toUpperCase()).filter((x: string) => WARP_ID.test(x)).slice(0, 300) : [];

    if (b.action === "save") {
      const lines = typeof b.text === "string" ? b.text.replace(/\r/g, "").split("\n") : [];
      let saved = 0;
      const bad: string[] = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // 한 줄: 고유번호 · 역할 · 출발 · 도착 · 출근시각 · 등록일 (탭, 쉼표, 또는 | 로 구분)
        const c = line.split(/\t|,|\|/).map((x) => x.trim());
        const id = (c[0] ?? "").toUpperCase();
        const role = ROLE(c[1] ?? "");
        const home = c[2] ?? "";
        const work = c[3] ?? "";
        const timeGo = c[4] ?? "";
        const regDate = c[5] ?? "";
        if (!WARP_ID.test(id) || !role || !home || (timeGo && !TIME.test(timeGo)) || (regDate && !DATE.test(regDate))) {
          bad.push(line.slice(0, 60));
          continue;
        }
        // 이미 목록에 추가된 글은 건드리지 않는다
        await sql`insert into warp_sync_items (warp_id, role, home, work, time_go, reg_date, status, updated_at)
          values (${id}, ${role}, ${home.slice(0, 120)}, ${work.slice(0, 120)}, ${timeGo.padStart(5, "0").slice(0, 5)}, ${regDate}, 'new', now())
          on conflict (warp_id) do update set role = excluded.role, home = excluded.home, work = excluded.work,
            time_go = excluded.time_go, reg_date = excluded.reg_date, updated_at = now()
          where warp_sync_items.added_at is null`;
        saved += 1;
      }
      return json({ ok: true, saved, bad });
    }

    if (b.action === "add") {
      if (!ids.length) return json({ error: "추가할 글을 고르세요." }, 400);
      const rows = await sql`select * from warp_sync_items where warp_id = any(${ids}::text[]) and added_at is null and status = 'new'`;
      let added = 0;
      const skipped: { warpId: string; why: string }[] = [];
      for (const r of rows) {
        const id = String(r.warp_id);
        const inPool = await sql`select 1 from warp_pools where upper(warp_id) = ${id} limit 1`;
        if (inPool.length) {
          skipped.push({ warpId: id, why: "이미 목록에 있음" });
          continue;
        }
        const acc = await sql`select l.email_norm, u.withdrawn_at, u.blocked from legacy_members l left join users u on u.id = l.matched_user where upper(l.warp_id) = ${id} limit 1`;
        if (acc.length && (acc[0].withdrawn_at || acc[0].blocked)) {
          skipped.push({ warpId: id, why: "탈퇴·정지 회원" });
          continue;
        }
        const noAccount = !acc.length || !acc[0].email_norm;
        await sql`insert into warp_pools (code, active, role, home, work, region, time_go, time_back, warp_id, reg_date, wait_since)
          values (${id}, true, ${String(r.role)}, ${String(r.home)}, ${String(r.work)}, '', ${String(r.time_go)}, '', ${id}, ${String(r.reg_date)},
            case when ${noAccount}::boolean then now() else null end)
          on conflict (code) do nothing`;
        await sql`update warp_sync_items set added_at = now(), updated_at = now() where warp_id = ${id}`;
        added += 1;
      }
      return json({ ok: true, added, skipped });
    }

    if (b.action === "status") {
      const status = String(b.status ?? "");
      if (!["new", "hold", "excluded"].includes(status)) return json({ error: "상태 값이 올바르지 않아요." }, 400);
      if (!ids.length) return json({ error: "고른 글이 없어요." }, 400);
      await sql`update warp_sync_items set status = ${status}, updated_at = now() where warp_id = any(${ids}::text[]) and added_at is null`;
      return json({ ok: true });
    }

    if (b.action === "delete") {
      if (!ids.length) return json({ error: "고른 글이 없어요." }, 400);
      await sql`delete from warp_sync_items where warp_id = any(${ids}::text[]) and added_at is null`;
      return json({ ok: true });
    }

    return json({ error: "알 수 없는 요청이에요." }, 400);
  } catch (e) {
    return fail(e);
  }
}
