import { nextOccurrence } from "./time";
import { kakaoAddress, osmAddress } from "./placeSearch";
import { db } from "./server";

/**
 * 워프에서 관리하던 정기카풀(2026-10-31 사용자 지시).
 * - 관리자가 워프 목록을 붙여넣으면 warp_pools에 저장(같은 코드는 덮어씀)
 * - 자택·회사 주소를 좌표로 바꿔(fillWarpGeo) 거리로만 매칭 후보를 찾는다(시간은 나중에 정함)
 * - 해당 고유번호 회원이 모두의카풀 계정과 이어지면 정기카풀 글로 자동으로 옮긴다(migrateWarpPools)
 * 다른 회원에게는 보이지 않고, 관리자 '정기 매칭' 탭에서만 쓴다.
 */
export type WarpPoolRow = { code: string; active: boolean; role: "driver" | "rider"; home: string; work: string; region: string; timeGo: string; timeBack: string; warpId: string; regDate: string };

const CODE = /^[A-Z0-9]{6,12}$/;
const WARP_ID = /^[0-9]{7}[A-Z]$/i;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const pad = (t: string) => (TIME.test(t) ? t.padStart(5, "0") : "");

/**
 * 붙여넣은 글을 읽는다. 두 가지 모양을 받는다.
 * 1) 워프 관리자 화면 복사: 한 줄에 한 칸, 글 사이 빈 줄(코드·사용·역할·자택·회사·지역·출근·퇴근·고유번호·등록일)
 * 2) 엑셀·CSV 복사: 한 줄에 한 글, 탭이나 쉼표로 같은 순서
 * 머리줄(카풀 유형·자택…)은 건너뛴다.
 */
export function parseWarpPools(text: string): { rows: WarpPoolRow[]; skipped: number } {
  const lines = text.replace(/\r/g, "").split("\n");
  const records: string[][] = [];
  const isRow = (cells: string[]) => cells.length >= 9 && CODE.test(cells[0].trim());
  const tabular = lines.filter((l) => /\t|,/.test(l)).map((l) => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim()));
  if (tabular.filter(isRow).length >= 1) {
    for (const c of tabular) if (isRow(c)) records.push(c);
  } else {
    let cur: string[] = [];
    const flush = () => {
      if (cur.length) records.push(cur);
      cur = [];
    };
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) {
        flush();
        continue;
      }
      // 새 글은 코드로 시작한다. 빈 줄이 없어도 코드가 나오면 새 글로 본다.
      if (CODE.test(l) && cur.length >= 9) flush();
      cur.push(l);
    }
    flush();
  }
  const rows: WarpPoolRow[] = [];
  let skipped = 0;
  for (const c of records) {
    if (!CODE.test(c[0] ?? "")) {
      skipped += c.length >= 9 ? 1 : 0;
      continue;
    }
    const [code, use, role, home, work, region, go, back, warpId, regDate] = c;
    if (!home || !work || !WARP_ID.test(warpId ?? "")) {
      skipped += 1;
      continue;
    }
    rows.push({
      code,
      active: !/미사용|중지|off/i.test(use ?? ""),
      role: /운전/.test(role ?? "") ? "driver" : "rider",
      home: home.slice(0, 120),
      work: work.slice(0, 120),
      region: (region ?? "").slice(0, 30),
      timeGo: pad(go ?? ""),
      timeBack: pad(back ?? ""),
      warpId: warpId.toUpperCase(),
      regDate: (regDate ?? "").slice(0, 10),
    });
  }
  return { rows, skipped };
}

export async function saveWarpPools(rows: WarpPoolRow[]): Promise<{ added: number; updated: number }> {
  const sql = db();
  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const x = await sql`
      insert into warp_pools (code, active, role, home, work, region, time_go, time_back, warp_id, reg_date)
      values (${r.code}, ${r.active}, ${r.role}, ${r.home}, ${r.work}, ${r.region}, ${r.timeGo}, ${r.timeBack}, ${r.warpId}, ${r.regDate})
      on conflict (code) do update set active = excluded.active, role = excluded.role,
        home = excluded.home, work = excluded.work, region = excluded.region, time_go = excluded.time_go, time_back = excluded.time_back,
        warp_id = excluded.warp_id, reg_date = excluded.reg_date, updated_at = now(),
        -- 주소가 바뀌면 위치를 다시 찾는다
        home_lat = case when warp_pools.home = excluded.home then warp_pools.home_lat end,
        home_lng = case when warp_pools.home = excluded.home then warp_pools.home_lng end,
        work_lat = case when warp_pools.work = excluded.work then warp_pools.work_lat end,
        work_lng = case when warp_pools.work = excluded.work then warp_pools.work_lng end,
        geo_tried_at = case when warp_pools.home = excluded.home and warp_pools.work = excluded.work then warp_pools.geo_tried_at end
      returning (xmax = 0) as inserted`;
    if (x[0]?.inserted) added += 1;
    else updated += 1;
  }
  return { added, updated };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 주소 → 좌표. 카카오(켜져 있으면) → OSM 원래 주소 → 번지 뺀 도로명 → 읍·면·동까지 순서로 줄여 가며 찾는다.
 * OSM은 결과 주소에 시·군·구 이름이 들어 있을 때만 쓴다(엉뚱한 곳 방지). OSM은 1초에 1번만 묻는다.
 */
export async function geocodeAddress(addr: string): Promise<{ lat: number; lng: number } | null> {
  const a = addr.replace(/\s*지하\s*/g, " ").replace(/\s+/g, " ").trim();
  if (a.length < 4) return null;
  const k = await kakaoAddress(a);
  if (k) return k;
  const parts = a.split(" ");
  const must = (parts.find((p, i) => i > 0 && /(시|군|구)$/.test(p)) ?? "").replace(/(특별|광역|특별자치)?시$|군$|구$/, "");
  const tries = [a, parts.filter((p) => !/^\d/.test(p)).join(" "), parts.slice(0, Math.min(parts.length, 3)).join(" ")];
  for (const q of [...new Set(tries)]) {
    if (q.split(" ").length < 2) continue;
    const r = await osmAddress(q, must);
    await sleep(1100);
    if (r) return r;
  }
  return null;
}

/** 위치를 아직 못 찾은 글을 시간 예산 안에서 채운다. 남은 수를 돌려준다. */
export async function fillWarpGeo(budgetMs = 20_000): Promise<{ done: number; left: number }> {
  const sql = db();
  const start = Date.now();
  let done = 0;
  while (Date.now() - start < budgetMs) {
    const r = await sql`select code, home, work, home_lat, work_lat from warp_pools
      where geo_tried_at is null and (home_lat is null or work_lat is null) order by reg_date desc limit 1`;
    if (!r.length) break;
    const x = r[0];
    const h = x.home_lat == null ? await geocodeAddress(String(x.home)) : null;
    const w = x.work_lat == null ? (String(x.work) === String(x.home) && h ? h : await geocodeAddress(String(x.work))) : null;
    await sql`update warp_pools set geo_tried_at = now(),
        home_lat = coalesce(home_lat, ${h?.lat ?? null}), home_lng = coalesce(home_lng, ${h?.lng ?? null}),
        work_lat = coalesce(work_lat, ${w?.lat ?? null}), work_lng = coalesce(work_lng, ${w?.lng ?? null})
      where code = ${x.code}`;
    done += 1;
  }
  const left = await sql`select count(*)::int as n from warp_pools where geo_tried_at is null and (home_lat is null or work_lat is null)`;
  return { done, left: Number(left[0].n) };
}

/** 두 좌표 사이 거리(km) */
export function km(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const x = (d - b) * r * Math.cos(((a + c) / 2) * r);
  const y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

export type PoolPoint = {
  kind: "warp" | "post";
  ref: string; // 워프 코드 또는 글 id
  role: "driver" | "rider";
  home: string;
  work: string;
  homeLat: number | null; homeLng: number | null;
  workLat: number | null; workLng: number | null;
  timeGo: string; timeBack: string;
  warpId: string; // 워프 고유번호(글이면 회원번호)
  userId: string | null; // 모두의카풀 계정
  name: string;
  active: boolean;
};

/** 매칭 대상 전체(워프 정기카풀 + 모두의카풀 진행 중 정기카풀 글) */
export async function allPoints(): Promise<PoolPoint[]> {
  const sql = db();
  const [w, p] = await Promise.all([
    sql`select w.*, l.matched_user, u.name from warp_pools w
        left join legacy_members l on upper(l.warp_id) = upper(w.warp_id)
        left join users u on u.id = l.matched_user`,
    sql`select p.id, p.role, p.origin, p.dest, p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng, p.time_go, p.time_back, p.user_id, u.name, u.member_code
        from posts p join users u on u.id = p.user_id
        where p.regular and p.status <> 'closed' and not coalesce(p.demo, false) and not u.test and u.withdrawn_at is null`,
  ]);
  const n = (v: unknown) => (v == null ? null : Number(v));
  return [
    ...w.map((x) => ({
      kind: "warp" as const, ref: String(x.code), role: (x.role === "driver" ? "driver" : "rider") as "driver" | "rider",
      home: String(x.home), work: String(x.work), homeLat: n(x.home_lat), homeLng: n(x.home_lng), workLat: n(x.work_lat), workLng: n(x.work_lng),
      timeGo: String(x.time_go ?? ""), timeBack: String(x.time_back ?? ""), warpId: String(x.warp_id), userId: x.matched_user ? String(x.matched_user) : null,
      name: String(x.name ?? ""), active: x.active === true,
    })),
    ...p.map((x) => ({
      kind: "post" as const, ref: String(x.id), role: (x.role === "driver" ? "driver" : "rider") as "driver" | "rider",
      home: String(x.origin), work: String(x.dest), homeLat: n(x.origin_lat), homeLng: n(x.origin_lng), workLat: n(x.dest_lat), workLng: n(x.dest_lng),
      timeGo: String(x.time_go ?? ""), timeBack: String(x.time_back ?? ""), warpId: String(x.member_code ?? ""), userId: String(x.user_id),
      name: String(x.name ?? ""), active: true,
    })),
  ];
}

/** 기준 한 건의 후보: 자택끼리·회사끼리 모두 반경 안. 가까운 순(두 거리 합). 시간은 보지 않는다. */
export function candidatesFor(me: PoolPoint, all: PoolPoint[], radiusKm: number, opposite: boolean) {
  if (me.homeLat == null || me.homeLng == null || me.workLat == null || me.workLng == null) return [];
  const out: (PoolPoint & { homeKm: number; workKm: number })[] = [];
  for (const o of all) {
    if (o.kind === me.kind && o.ref === me.ref) continue;
    if (me.userId && o.userId === me.userId) continue;
    if (!o.active || o.homeLat == null || o.homeLng == null || o.workLat == null || o.workLng == null) continue;
    if (opposite && o.role === me.role) continue;
    const homeKm = km(me.homeLat, me.homeLng, o.homeLat, o.homeLng);
    const workKm = km(me.workLat, me.workLng, o.workLat, o.workLng);
    if (homeKm <= radiusKm && workKm <= radiusKm) out.push({ ...o, homeKm: Math.round(homeKm * 10) / 10, workKm: Math.round(workKm * 10) / 10 });
  }
  return out.sort((a, b) => a.homeKm + a.workKm - (b.homeKm + b.workKm)).slice(0, 50);
}

/**
 * 계정과 이어진 워프 정기카풀을 그 회원의 정기카풀 글로 옮긴다(한 번만). 이미 진행 중인 정기카풀 글이 있으면 새로 만들지 않고 그 글로 표시만 한다.
 * userId를 주면 그 회원만, 없으면 이어진 모든 회원.
 */
export async function migrateWarpPools(userId?: string): Promise<number> {
  const sql = db();
  const rows = userId
    ? await sql`select w.*, l.matched_user from warp_pools w join legacy_members l on upper(l.warp_id) = upper(w.warp_id)
        where l.matched_user = ${userId} and w.migrated_post_id is null and w.active limit 5`
    : await sql`select w.*, l.matched_user from warp_pools w join legacy_members l on upper(l.warp_id) = upper(w.warp_id)
        join users u on u.id = l.matched_user
        where l.matched_user is not null and w.migrated_post_id is null and w.active and u.withdrawn_at is null limit 300`;
  let moved = 0;
  for (const w of rows) {
    const uid = String(w.matched_user);
    const existing = await sql`select id from posts where user_id = ${uid} and regular and status <> 'closed' limit 1`;
    if (existing.length) {
      await sql`update warp_pools set migrated_post_id = ${existing[0].id} where code = ${w.code}`;
      continue;
    }
    const timeGo = String(w.time_go || "08:00");
    const days = "12345";
    const next = new Date(nextOccurrence(days, timeGo)).toISOString();
    const ins = await sql`
      insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng,
                         regular, days, time_go, time_back, tags)
      values (${uid}, ${w.role === "driver" ? "driver" : "rider"}, 'commute', 'free', 0, ${String(w.home).slice(0, 60)}, ${String(w.work).slice(0, 60)}, ${next}, 1,
              '워프에서 이어온 정기카풀이에요. 비용은 대화로 정해요.',
              ${w.home_lat}, ${w.home_lng}, ${w.work_lat}, ${w.work_lng}, true, ${days}, ${timeGo}, ${String(w.time_back ?? "")}, '{}'::text[])
      returning id`;
    await sql`update warp_pools set migrated_post_id = ${ins[0].id} where code = ${w.code}`;
    moved += 1;
  }
  return moved;
}
