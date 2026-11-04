import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";
import { runWarpSync } from "@/lib/warpSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 관리자 '워프동기화' 탭(2026-11-04 사용자 지시): 화면(사진)에서 확인한 워프 1회 카풀 글을 모아 두고,
 * [목록에 추가](= 등록 진행)를 누르면 서버가 계정 확인 → 대기 또는 등록 → 본인 메일까지 처리한다(lib/warpSync.ts).
 * 스크린샷 원본은 저장하지 않는다.
 * GET  : 글 + 상태
 * POST : action = save(붙여넣기) | go(목록에 추가) | status(보류·제외·되돌리기) | delete | run(지금 처리)
 */

const WARP_ID = /^[0-9]{7}[A-Z]$/;
const ROLE = (s: string) => (/운전|driver/i.test(s) ? "driver" : /탑승|rider/i.test(s) ? "rider" : "");
const STATE = (s: string) => (/완료|done/i.test(s) ? "done" : /경과|past/i.test(s) ? "past" : "open");
/** "2026-11-05 08:00" (한국 시각) → Date */
const kst = (s: string) => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T]([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  return m ? new Date(`${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:00+09:00`) : null;
};

export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`select s.*,
        l.email_norm, u.id as acc_user, u.withdrawn_at, u.blocked
      from warp_sync_items s
      left join lateral (select email_norm, matched_user from legacy_members x where upper(x.warp_id) = upper(s.warp_id)
                         order by (x.matched_user is null) limit 1) l on true
      left join users u on u.id = l.matched_user
      order by coalesce(s.reg_at, s.created_at) desc, s.id desc limit 500`;
    const items = rows.map((r) => {
      const gone = !!(r.withdrawn_at || r.blocked);
      const hasAccount = !!r.acc_user || !!r.email_norm;
      const stage = String(r.stage ?? "");
      const status = String(r.status);
      const label = stage === "mailed" ? "등록 · 메일 보냄"
        : stage === "posted" ? (r.mailed_at ? "등록 · 메일 못 보냄" : "등록 · 메일 대기")
        : stage === "queued" ? "대기(명단에 없음)"
        : stage === "skip" ? "건너뜀"
        : status === "go" ? "처리 중"
        : gone ? "탈퇴·정지" : hasAccount ? "계정 있음" : "계정 없음";
      return {
        id: String(r.id), warpId: String(r.warp_id), role: String(r.role),
        home: String(r.home), work: String(r.work), homeName: String(r.home_name ?? ""), workName: String(r.work_name ?? ""),
        departAt: r.depart_at ? new Date(r.depart_at).toISOString() : "", regAt: r.reg_at ? new Date(r.reg_at).toISOString() : "",
        warpState: String(r.warp_state ?? "open"), price: Number(r.price) || 0, tags: String(r.tags ?? ""),
        kind: String(r.kind ?? "once"), timeGo: String(r.time_go ?? ""), timeBack: String(r.time_back ?? ""),
        status, stage, note: String(r.note ?? ""), postId: r.post_id ? String(r.post_id) : "", label, hasAccount, gone,
        canGo: status === "new" && !gone,
        locked: !!r.post_id || stage === "queued",
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
    const ids: string[] = Array.isArray(b.ids) ? b.ids.map((x: unknown) => String(x)).filter((x: string) => /^\d+$/.test(x)).slice(0, 300) : [];

    if (b.action === "save") {
      const lines = typeof b.text === "string" ? b.text.replace(/\r/g, "").split("\n") : [];
      let saved = 0;
      const bad: string[] = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // 한 줄: 고유번호 | 운전자·탑승자 | 출발 주소 | 도착 주소 | 출발 일시(2026-11-05 08:00) | 상태(대기·시간경과·완료) | 금액 | 등록 일시
        const c = line.split(/\t|\|/).map((x) => x.trim());
        const id = (c[0] ?? "").toUpperCase();
        const role = ROLE(c[1] ?? "");
        const home = c[2] ?? "";
        const work = c[3] ?? "";
        // 출발 일시 칸에 "07:00/19:00"처럼 출근·퇴근 시각만 적으면 정기카풀
        const reg2 = /^([01]?\d|2[0-3]):([0-5]\d)\s*[/~-]\s*(?:(([01]?\d|2[0-3]):([0-5]\d)))?$/.exec((c[4] ?? "").trim());
        const depart = reg2 ? null : kst(c[4] ?? "");
        const state = STATE(c[5] ?? "");
        const price = Number(String(c[6] ?? "").replace(/[^\d]/g, "")) || 0;
        const reg = kst(c[7] ?? "");
        if (!WARP_ID.test(id) || !role || !home || !work || (!depart && !reg2)) {
          bad.push(line.slice(0, 60));
          continue;
        }
        if (reg2) {
          const go = `${reg2[1].padStart(2, "0")}:${reg2[2]}`;
          const back = reg2[3] ? `${reg2[4].padStart(2, "0")}:${reg2[5]}` : "";
          await sql`insert into warp_sync_items (warp_id, kind, role, home, work, time_go, time_back, reg_date, reg_at, warp_state, price, status, updated_at)
            values (${id}, 'regular', ${role}, ${home.slice(0, 120)}, ${work.slice(0, 120)}, ${go}, ${back}, ${reg ? reg.toISOString().slice(0, 10) : ""},
                    ${reg ? reg.toISOString() : null}, 'open', ${price}, 'new', now())
            on conflict (warp_id) where kind = 'regular' do nothing`;
          saved += 1;
          continue;
        }
        if (!depart) continue;
        await sql`insert into warp_sync_items (warp_id, role, home, work, time_go, reg_date, depart_at, reg_at, warp_state, price, status, updated_at)
          values (${id}, ${role}, ${home.slice(0, 120)}, ${work.slice(0, 120)}, '', ${reg ? reg.toISOString().slice(0, 10) : ""},
                  ${depart.toISOString()}, ${reg ? reg.toISOString() : null}, ${state}, ${price}, 'new', now())
          on conflict (warp_id, depart_at) do nothing`;
        saved += 1;
      }
      return json({ ok: true, saved, bad });
    }

    if (b.action === "go") {
      if (!ids.length) return json({ error: "고른 글이 없어요." }, 400);
      const r = await sql`update warp_sync_items set status = 'go', updated_at = now() where id = any(${ids}::bigint[]) and status in ('new', 'hold') returning id`;
      // 바로 한 번 처리(남은 것은 사이트 접속 때 3분마다 이어서)
      const run = await runWarpSync(40_000);
      return json({ ok: true, queuedForRun: r.length, ...run });
    }

    if (b.action === "run") {
      return json({ ok: true, ...(await runWarpSync(40_000)) });
    }

    if (b.action === "status") {
      const status = String(b.status ?? "");
      if (!["new", "hold", "excluded"].includes(status)) return json({ error: "상태 값이 올바르지 않아요." }, 400);
      if (!ids.length) return json({ error: "고른 글이 없어요." }, 400);
      await sql`update warp_sync_items set status = ${status}, updated_at = now() where id = any(${ids}::bigint[]) and post_id is null and stage in ('', 'queued')`;
      return json({ ok: true });
    }

    if (b.action === "delete") {
      if (!ids.length) return json({ error: "고른 글이 없어요." }, 400);
      await sql`delete from warp_sync_items where id = any(${ids}::bigint[]) and post_id is null`;
      return json({ ok: true });
    }

    return json({ error: "알 수 없는 요청이에요." }, 400);
  } catch (e) {
    return fail(e);
  }
}
