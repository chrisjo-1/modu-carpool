import { nextOccurrence } from "./time";
import { kakaoAddress, osmAddress } from "./placeSearch";
import { db } from "./server";

/**
 * 워프에서 관리하던 정기카풀(2026-10-31 사용자 지시).
 * - 관리자가 워프 목록을 붙여넣으면 warp_pools에 저장(같은 코드는 덮어씀)
 * - 자택·회사 주소를 좌표로 바꿔(fillWarpGeo) 거리로만 매칭 후보를 찾는다(시간은 나중에 정함)
 * - 관리자가 고른 것만 정기카풀 글로 올린다(publishWarpPools, 자동 이전은 2026-10-31에 없앰)
 * 다른 회원에게는 보이지 않고, 관리자 '정기 매칭' 탭에서만 쓴다.
 */
export type WarpPoolRow = { code: string; active: boolean; role: "driver" | "rider"; home: string; work: string; region: string; timeGo: string; timeBack: string; warpId: string; regDate: string };

const CODE = /^[A-Z]{6,12}$/; // 워프 카풀 코드는 영문 대문자만(고유번호 0393686L과 구분)
const WARP_ID = /^[0-9]{7}[A-Z0-9]$/i;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (t: string) => (TIME.test(t) ? t.padStart(5, "0") : "");

/** 한 글: [코드, 사용, 역할, 주소 1~2개, (지역), 출근, 퇴근, 고유번호, 등록일, (쪽 번호…)]. 회사 주소·지역이 빠진 글도 받는다. */
function readOne(row: string[]): WarpPoolRow | null {
  let c = row;
  if (!CODE.test(c[0] ?? "") || c.length < 7) return null;
  let t = -1;
  for (let i = 3; i < c.length; i++) if (TIME.test(c[i])) { t = i; break; }
  // 출근·퇴근 시간이 비어 바로 고유번호가 오는 글도 받는다(시간은 빈칸)
  if (t < 0) {
    const w = c.findIndex((x, i) => i >= 4 && WARP_ID.test(x));
    if (w >= 4) {
      c = [...c.slice(0, w), "", "", ...c.slice(w)];
      t = w;
    }
  }
  if (t < 4 || t + 2 >= c.length) return null;
  // 고유번호가 빠지고 바로 등록일이 오는 글(워프 탈퇴 회원 등)도 받는다 — 위치 매칭에는 쓰고 연락은 못 함
  if (DATE.test(c[t + 2])) c = [...c.slice(0, t + 2), "", ...c.slice(t + 2)];
  else if (!WARP_ID.test(c[t + 2])) return null;
  const mid = c.slice(3, t);
  let region = "";
  if (mid.length >= 2 && !/\d/.test(mid[mid.length - 1])) region = mid.pop() as string;
  else if (mid.length === 1 && !/\d/.test(mid[0])) return null;
  if (!mid.length) return null;
  return {
    code: c[0],
    active: !/미사용|중지|off/i.test(c[1] ?? ""),
    role: /운전/.test(c[2] ?? "") ? "driver" : "rider",
    home: mid[0].slice(0, 120),
    work: (mid[1] ?? "").slice(0, 120),
    region: region.slice(0, 30),
    timeGo: pad(c[t]),
    timeBack: pad(c[t + 1]),
    warpId: c[t + 2].toUpperCase(),
    regDate: DATE.test(c[t + 3] ?? "") ? c[t + 3] : "",
  };
}

/**
 * 붙여넣은 글을 읽는다. 두 가지 모양을 받는다.
 * 1) 워프 관리자 화면 복사: 한 줄에 한 칸, 글 사이 빈 줄(빈 줄이 없어도 코드가 나오면 새 글)
 * 2) 엑셀·CSV 복사: 한 줄에 한 글, 탭이나 쉼표로 같은 순서
 * 머리줄(카풀 유형·자택…)과 쪽 번호는 건너뛴다.
 */
export function parseWarpPools(text: string): { rows: WarpPoolRow[]; skipped: number } {
  const lines = text.replace(/\r/g, "").split("\n");
  const records: string[][] = [];
  const tabular = lines.filter((l) => /\t/.test(l) || l.split(",").length >= 8).map((l) => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, "").trim()));
  if (tabular.some((c) => CODE.test(c[0] ?? ""))) {
    // 표: 빈 칸(회사·지역 없음)은 빼고 같은 규칙으로 읽는다
    for (const c of tabular) if (CODE.test(c[0] ?? "")) records.push(c.filter((x) => x !== ""));
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
      if (CODE.test(l) && cur.some((x) => TIME.test(x))) flush();
      cur.push(l);
    }
    flush();
  }
  const rows: WarpPoolRow[] = [];
  let skipped = 0;
  for (const c of records) {
    const r = readOne(c);
    if (r) rows.push(r);
    else if (CODE.test(c[0] ?? "")) skipped += 1;
  }
  return { rows, skipped };
}

export async function saveWarpPools(input: WarpPoolRow[]): Promise<{ added: number; updated: number }> {
  const sql = db();
  // 같은 코드가 여러 번 붙어 오면 마지막 것만(한 번에 200개씩 묶어 저장 — 수천 건도 1분 안에)
  const rows = [...new Map(input.map((r) => [r.code, r])).values()];
  let added = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const col = <K extends keyof WarpPoolRow>(k: K) => part.map((r) => r[k]);
    const x = await sql`
      insert into warp_pools (code, active, role, home, work, region, time_go, time_back, warp_id, reg_date)
      select * from unnest(${col("code")}::text[], ${col("active")}::boolean[], ${col("role")}::text[], ${col("home")}::text[], ${col("work")}::text[],
                           ${col("region")}::text[], ${col("timeGo")}::text[], ${col("timeBack")}::text[], ${col("warpId")}::text[], ${col("regDate")}::text[])
      on conflict (code) do update set active = excluded.active, role = excluded.role,
        home = excluded.home, work = excluded.work, region = excluded.region, time_go = excluded.time_go, time_back = excluded.time_back,
        warp_id = excluded.warp_id, reg_date = case when excluded.reg_date = '' then warp_pools.reg_date else excluded.reg_date end, updated_at = now(),
        -- 주소가 바뀌면 위치를 다시 찾는다
        home_lat = case when warp_pools.home = excluded.home then warp_pools.home_lat end,
        home_lng = case when warp_pools.home = excluded.home then warp_pools.home_lng end,
        work_lat = case when warp_pools.work = excluded.work then warp_pools.work_lat end,
        work_lng = case when warp_pools.work = excluded.work then warp_pools.work_lng end,
        geo_tried_at = case when warp_pools.home = excluded.home and warp_pools.work = excluded.work then warp_pools.geo_tried_at end
      returning (xmax = 0) as inserted`;
    for (const r of x) {
      if (r.inserted) added += 1;
      else updated += 1;
    }
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
      where geo_tried_at is null and (home_lat is null or (work_lat is null and work <> '')) order by reg_date desc limit 1`;
    if (!r.length) break;
    const x = r[0];
    // 같은 주소를 이미 찾은 글이 있으면 그 위치를 쓴다(지도 요청 줄이기)
    const known = async (addr: string) => {
      if (!addr) return null;
      const k = await sql`select lat, lng from (
          select home_lat as lat, home_lng as lng from warp_pools where home = ${addr} and home_lat is not null
          union all select work_lat, work_lng from warp_pools where work = ${addr} and work_lat is not null) t limit 1`;
      return k.length ? { lat: Number(k[0].lat), lng: Number(k[0].lng) } : geocodeAddress(addr);
    };
    const h = x.home_lat == null ? await known(String(x.home)) : null;
    const w = x.work_lat == null && String(x.work) ? (String(x.work) === String(x.home) && h ? h : await known(String(x.work))) : null;
    await sql`update warp_pools set geo_tried_at = now(),
        home_lat = coalesce(home_lat, ${h?.lat ?? null}), home_lng = coalesce(home_lng, ${h?.lng ?? null}),
        work_lat = coalesce(work_lat, ${w?.lat ?? null}), work_lng = coalesce(work_lng, ${w?.lng ?? null})
      where code = ${x.code}`;
    done += 1;
  }
  const left = await sql`select count(*)::int as n from warp_pools where geo_tried_at is null and (home_lat is null or (work_lat is null and work <> ''))`;
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
        where p.regular and p.status <> 'closed' and not coalesce(p.demo, false) and not u.test and u.withdrawn_at is null
          and not exists (select 1 from warp_pools wp where wp.post_id = p.id)`,
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
  if (me.homeLat == null || me.homeLng == null) return [];
  const out: (PoolPoint & { homeKm: number; workKm: number })[] = [];
  for (const o of all) {
    if (o.kind === me.kind && o.ref === me.ref) continue;
    if (me.userId && o.userId === me.userId) continue;
    if (!o.active || o.homeLat == null || o.homeLng == null) continue;
    if (opposite && o.role === me.role) continue;
    const homeKm = km(me.homeLat, me.homeLng, o.homeLat, o.homeLng);
    // 회사 주소가 없는 글(워프에 주소 하나만 적은 글)은 자택만 비교한다
    const both = me.workLat != null && me.workLng != null && o.workLat != null && o.workLng != null;
    const workKm = both ? km(me.workLat as number, me.workLng as number, o.workLat as number, o.workLng as number) : -1;
    if (homeKm <= radiusKm && workKm <= radiusKm) out.push({ ...o, homeKm: Math.round(homeKm * 10) / 10, workKm: workKm < 0 ? -1 : Math.round(workKm * 10) / 10 });
  }
  const score = (x: { homeKm: number; workKm: number }) => x.homeKm + (x.workKm < 0 ? radiusKm : x.workKm);
  return out.sort((a, b) => score(a) - score(b)).slice(0, 50);
}

export type PairMember = PoolPoint & { homeKm: number; workKm: number; chance: number };
export type PairGroup = { driver: PoolPoint; riders: PairMember[]; best: number };

/** 거리로만 본 매칭 가능성(%): 자택+회사 거리 합이 0이면 100, 둘 다 반경 끝이면 0. 회사가 없으면 자택 거리를 두 번 센다. */
function chanceOf(homeKm: number, workKm: number, radiusKm: number) {
  const d = homeKm + (workKm < 0 ? homeKm : workKm);
  return Math.max(1, Math.round(100 * (1 - d / (2 * radiusKm))));
}

/**
 * 매칭 묶음(2026-10-31 사용자 지시): 운전자마다 가능성 높은 탑승자 1~2명, 묶음은 가능성 높은 순.
 * 위치가 있는 사용 중 글만, 같은 계정끼리는 제외. 시간은 아직 보지 않는다.
 */
export function pairGroups(all: PoolPoint[], radiusKm: number, perDriver = 2, limit = 150): PairGroup[] {
  const ok = (p: PoolPoint) => p.active && p.homeLat != null && p.homeLng != null;
  const drivers = all.filter((p) => ok(p) && p.role === "driver");
  const riders = all.filter((p) => ok(p) && p.role === "rider");
  const groups: PairGroup[] = [];
  for (const d of drivers) {
    const list: PairMember[] = [];
    for (const r of riders) {
      if (d.userId && r.userId === d.userId) continue;
      const homeKm = km(d.homeLat as number, d.homeLng as number, r.homeLat as number, r.homeLng as number);
      if (homeKm > radiusKm) continue;
      const both = d.workLat != null && d.workLng != null && r.workLat != null && r.workLng != null;
      const workKm = both ? km(d.workLat as number, d.workLng as number, r.workLat as number, r.workLng as number) : -1;
      if (workKm > radiusKm) continue;
      const h = Math.round(homeKm * 10) / 10;
      const w = workKm < 0 ? -1 : Math.round(workKm * 10) / 10;
      list.push({ ...r, homeKm: h, workKm: w, chance: chanceOf(homeKm, workKm, radiusKm) });
    }
    if (!list.length) continue;
    list.sort((a, b) => b.chance - a.chance);
    const top = list.slice(0, perDriver);
    groups.push({ driver: d, riders: top, best: top[0].chance });
  }
  return groups.sort((a, b) => b.best - a.best || (b.riders[1]?.chance ?? 0) - (a.riders[1]?.chance ?? 0)).slice(0, limit);
}

/** 지금 글 표시 방식에 맞춘 짧은 장소 이름: 시·도와 시·군·구를 빼고 읍·면·도로명만("서울 송파구 송파대로 345" → "송파대로 345"). 지역 글씨는 위치로 따로 붙는다. */
export function shortPlace(addr: string): string {
  const parts = addr.replace(/\s*지하\s+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  let i = 0;
  if (parts.length > 2 && /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)|(도|특별시|광역시|특별자치시|통합특별시)$/.test(parts[0])) i = 1;
  while (i < parts.length - 2 && /(시|군|구)$/.test(parts[i])) i += 1;
  return parts.slice(i).join(" ").slice(0, 60) || addr.slice(0, 60);
}

/**
 * 관리자가 고른 워프 정기카풀만 정기카풀 글로 올린다(2026-10-31 사용자 지시: 자동 이전 대신 골라서 등록).
 * 계정이 이어진 회원 · 사용 중 · 출발·도착 주소와 위치가 모두 있는 글만. 이미 올린 것은 건너뛴다.
 */
export async function publishWarpPools(codes: string[], cost: "free" | "fixed", price: number) {
  const sql = db();
  const rows = await sql`select w.*, l.matched_user, u.withdrawn_at, u.blocked from warp_pools w
      left join legacy_members l on upper(l.warp_id) = upper(w.warp_id) and w.warp_id <> ''
      left join users u on u.id = l.matched_user
      where w.code = any(${codes}::text[])`;
  const out = { posted: 0, skipped: [] as { code: string; why: string }[] };
  for (const w of rows) {
    const code = String(w.code);
    const why = w.post_id ? "이미 올림"
      : !w.matched_user ? "모두의카풀 계정 없음"
      : w.withdrawn_at || w.blocked ? "탈퇴·정지 회원"
      : !w.active ? "워프에서 미사용"
      : !String(w.work) ? "목적지(회사) 주소 없음"
      : w.home_lat == null || w.work_lat == null ? "위치를 아직 못 찾음" : "";
    if (why) {
      out.skipped.push({ code, why });
      continue;
    }
    const timeGo = String(w.time_go || "08:00");
    const days = "12345";
    const next = new Date(nextOccurrence(days, timeGo)).toISOString();
    const ins = await sql`
      insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng,
                         regular, days, time_go, time_back, tags)
      values (${w.matched_user}, ${w.role === "driver" ? "driver" : "rider"}, 'commute', ${cost}, ${cost === "fixed" ? price : 0},
              ${shortPlace(String(w.home))}, ${shortPlace(String(w.work))}, ${next}, 1, '',
              ${w.home_lat}, ${w.home_lng}, ${w.work_lat}, ${w.work_lng}, true, ${days}, ${timeGo}, ${String(w.time_back ?? "")}, '{}'::text[])
      returning id`;
    await sql`update warp_pools set post_id = ${ins[0].id} where code = ${code}`;
    out.posted += 1;
  }
  return out;
}

/** 올린 글 내리기: 신청이 없으면 지우고, 있으면 마감으로 바꾼다. */
export async function unpublishWarpPools(codes: string[]) {
  const sql = db();
  const rows = await sql`select code, post_id from warp_pools where code = any(${codes}::text[]) and post_id is not null`;
  let removed = 0;
  let closed = 0;
  for (const r of rows) {
    const has = await sql`select 1 from requests where post_id = ${r.post_id} limit 1`;
    if (has.length) {
      await sql`update posts set status = 'closed' where id = ${r.post_id}`;
      closed += 1;
    } else {
      await sql`delete from posts where id = ${r.post_id}`;
      removed += 1;
    }
    await sql`update warp_pools set post_id = null where code = ${r.code}`;
  }
  return { removed, closed };
}
