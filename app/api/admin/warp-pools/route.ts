import { body, clientIp, db, ensureSchema, fail, isAdmin, json, text } from "@/lib/server";
import { allPoints, candidatesFor, pairGroups, fillWarpGeo, migrateWarpPools, parseWarpPools, saveWarpPools } from "@/lib/warpPool";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 관리자 '정기 매칭' 탭(2026-10-31 사용자 지시: 매칭은 거리로만, 관리자 화면에서만 검색).
 * GET              : 통계 + 목록(?q= 고유번호·코드·주소, ?role=, ?geo=none) 최대 200
 * GET ?match=코드|post:글ID&r=3&opp=1 : 그 건의 후보(자택끼리·회사끼리 반경 안)
 * GET ?csv=1       : 저장된 워프 정기카풀 전체 CSV(엑셀용)
 * POST {action:"upload", text} : 붙여넣은 워프 목록 저장 → 계정이 이어진 회원은 바로 정기카풀 글로 옮김
 * POST {action:"geo"}          : 위치 못 찾은 글 채우기(한 번에 약 40초)
 * POST {action:"phone", warpId|userId} : 전화번호 보기(관리자 화면에서만, phone_view_log 기록)
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const sql = db();
    const p = new URL(req.url).searchParams;
    if (p.get("csv")) {
      const rows = await sql`select code, active, role, home, work, region, time_go, time_back, warp_id, reg_date,
          home_lat is not null and (work_lat is not null or work = '') as geo, migrated_post_id is not null as moved
        from warp_pools order by reg_date desc, code`;
      const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [["코드", "사용", "역할", "자택", "회사", "지역", "출근", "퇴근", "회원 고유번호", "등록일", "위치", "모두의카풀 글"].map(q).join(",")];
      for (const r of rows)
        lines.push([r.code, r.active ? "사용" : "미사용", r.role === "driver" ? "운전자" : "탑승자", r.home, r.work, r.region, r.time_go, r.time_back, r.warp_id, r.reg_date, r.geo ? "O" : "X", r.moved ? "O" : "X"].map(q).join(","));
      return new Response("﻿" + lines.join("\r\n"), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("워프_정기카풀.csv")}` },
      });
    }
    if (p.get("groups")) {
      const r = Math.min(30, Math.max(0.5, Number(p.get("r")) || 3));
      const all = await allPoints();
      const groups = pairGroups(all, r, Number(p.get("n")) === 1 ? 1 : 2);
      const geo = all.filter((x) => x.active && x.homeLat != null);
      return json({ groups, drivers: geo.filter((x) => x.role === "driver").length, riders: geo.filter((x) => x.role === "rider").length });
    }
    const match = text(p.get("match"), 60);
    if (match) {
      const r = Math.min(30, Math.max(0.5, Number(p.get("r")) || 3));
      const all = await allPoints();
      const me = match.startsWith("post:") ? all.find((x) => x.kind === "post" && x.ref === match.slice(5)) : all.find((x) => x.kind === "warp" && x.ref === match);
      if (!me) return json({ error: "기준 글을 찾지 못했어요." }, 404);
      if (me.homeLat == null) return json({ me, list: [], noGeo: true });
      return json({ me, list: candidatesFor(me, all, r, p.get("opp") === "1") });
    }
    const q = text(p.get("q"), 60).trim();
    const like = `%${q}%`;
    const role = p.get("role") === "driver" || p.get("role") === "rider" ? p.get("role") : "";
    const noGeo = p.get("geo") === "none";
    const [stats, rows, posts] = await Promise.all([
      sql`select count(*)::int as total,
          count(*) filter (where role = 'driver')::int as drivers,
          count(*) filter (where home_lat is not null and (work_lat is not null or work = ''))::int as geo,
          count(*) filter (where geo_tried_at is null and (home_lat is null or (work_lat is null and work <> '')))::int as geo_wait,
          count(*) filter (where geo_tried_at is not null and (home_lat is null or (work_lat is null and work <> '')))::int as geo_fail,
          count(*) filter (where migrated_post_id is not null)::int as moved,
          count(*) filter (where exists (select 1 from legacy_members l where upper(l.warp_id) = upper(w.warp_id) and l.matched_user is not null))::int as linked,
          count(*) filter (where exists (select 1 from legacy_members l where upper(l.warp_id) = upper(w.warp_id)))::int as in_legacy
        from warp_pools w`,
      sql`select w.code, w.active, w.role, w.home, w.work, w.region, w.time_go, w.time_back, w.warp_id, w.reg_date,
          w.home_lat is not null and (w.work_lat is not null or w.work = '') as geo, w.geo_tried_at is not null as tried, w.migrated_post_id,
          l.matched_user, l.withdrawn, l.email is not null and l.email <> '' as has_mail, u.name
        from warp_pools w
        left join legacy_members l on upper(l.warp_id) = upper(w.warp_id)
        left join users u on u.id = l.matched_user
        where (${q} = '' or w.code ilike ${like} or w.warp_id ilike ${like} or w.home ilike ${like} or w.work ilike ${like} or coalesce(u.name, '') ilike ${like})
          and (${role} = '' or w.role = ${role})
          and (not ${noGeo} or w.home_lat is null or (w.work_lat is null and w.work <> ''))
        order by w.reg_date desc, w.code limit 200`,
      sql`select count(*)::int as n from posts p join users u on u.id = p.user_id
        where p.regular and p.status <> 'closed' and not coalesce(p.demo, false) and not u.test and p.origin_lat is not null and p.dest_lat is not null`,
    ]);
    const s = stats[0];
    return json({
      stats: {
        total: s.total, drivers: s.drivers, geo: s.geo, geoWait: s.geo_wait, geoFail: s.geo_fail, moved: s.moved, linked: s.linked, inLegacy: s.in_legacy,
        modoPosts: posts[0].n,
      },
      list: rows.map((r) => ({
        code: String(r.code), active: r.active === true, role: r.role === "driver" ? "driver" : "rider", home: String(r.home), work: String(r.work),
        region: String(r.region), timeGo: String(r.time_go), timeBack: String(r.time_back), warpId: String(r.warp_id), regDate: String(r.reg_date),
        geo: r.geo === true, tried: r.tried === true, moved: !!r.migrated_post_id, userId: r.matched_user ? String(r.matched_user) : null,
        name: String(r.name ?? ""), withdrawn: r.withdrawn === true, hasMail: r.has_mail === true,
      })),
    });
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
    if (b.action === "upload") {
      const raw = typeof b.text === "string" ? b.text.slice(0, 2_000_000) : "";
      const { rows, skipped } = parseWarpPools(raw);
      if (!rows.length) return json({ error: "읽을 수 있는 정기카풀 글이 없어요. 워프 목록을 그대로 복사해 붙여 주세요." }, 400);
      const saved = await saveWarpPools(rows);
      // 이미 모두의카풀 계정과 이어진 회원은 바로 옮긴다(위치는 나중에 채워져도 글은 주소 이름으로 먼저 보인다)
      const moved = await migrateWarpPools().catch(() => 0);
      return json({ ok: true, read: rows.length, skipped, ...saved, moved });
    }
    if (b.action === "geo") {
      const r = await fillWarpGeo(40_000);
      // 위치가 생긴 글을 옮긴 글에도 채운다(옮길 때 위치가 없던 글)
      await sql`update posts p set origin_lat = w.home_lat, origin_lng = w.home_lng, dest_lat = w.work_lat, dest_lng = w.work_lng, geo_tried_at = null
        from warp_pools w where w.migrated_post_id = p.id and p.origin_lat is null and w.home_lat is not null and w.work_lat is not null`.catch(() => {});
      return json({ ok: true, ...r });
    }
    if (b.action === "phone") {
      const warpId = text(b.warpId, 12).toUpperCase();
      const userId = text(b.userId, 40);
      let phone = "";
      if (warpId) {
        const l = await sql`select phone, withdrawn from legacy_members where upper(warp_id) = ${warpId} limit 1`;
        if (l[0]?.withdrawn) return json({ error: "워프 탈퇴 회원이라 번호가 없어요." }, 400);
        phone = String(l[0]?.phone ?? "");
      }
      if (!phone && userId) {
        const u = await sql`select contact, contact_type from users where id = ${userId} and withdrawn_at is null`;
        if (u[0] && /^0\d{8,10}$|^01\d-?\d{3,4}-?\d{4}$/.test(String(u[0].contact).replace(/\s/g, ""))) phone = String(u[0].contact);
      }
      await sql`insert into phone_view_log (kind, ref, ip) values (${warpId ? "warp" : "user"}, ${warpId || userId}, ${clientIp(req)})`;
      return json({ ok: true, phone: phone || "" });
    }
    return json({ error: "알 수 없는 요청이에요." }, 400);
  } catch (e) {
    return fail(e);
  }
}
