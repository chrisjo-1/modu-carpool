import { nextOccurrence } from "./time";
import { kakaoAddress, osmAddress, photonAddress } from "./placeSearch";
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

export type SaveResult = { added: number; updated: number; same: number; changed: string[]; existing: string[]; dupInPaste: string[] };

/** 저장 + 중복 보고: 이미 있던 코드(내용 바뀜/같음)와 붙여넣은 글 안에서 겹친 코드. 이미 있던 코드는 dup_count를 1 올린다. */
export async function saveWarpPools(input: WarpPoolRow[]): Promise<SaveResult> {
  const sql = db();
  const seen = new Map<string, number>();
  for (const r of input) seen.set(r.code, (seen.get(r.code) ?? 0) + 1);
  const dupInPaste = [...seen].filter(([, n]) => n > 1).map(([c]) => c);
  // 같은 코드가 여러 번 붙어 오면 마지막 것만(한 번에 200개씩 묶어 저장 — 수천 건도 1분 안에)
  const rows = [...new Map(input.map((r) => [r.code, r])).values()];
  const res: SaveResult = { added: 0, updated: 0, same: 0, changed: [], existing: [], dupInPaste };
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const col = <K extends keyof WarpPoolRow>(k: K) => part.map((r) => r[k]);
    const before = await sql`select code, active, role, home, work, time_go, time_back, warp_id from warp_pools where code = any(${col("code")}::text[])`;
    const old = new Map(before.map((r) => [String(r.code), r]));
    await sql`
      insert into warp_pools (code, active, role, home, work, region, time_go, time_back, warp_id, reg_date)
      select * from unnest(${col("code")}::text[], ${col("active")}::boolean[], ${col("role")}::text[], ${col("home")}::text[], ${col("work")}::text[],
                           ${col("region")}::text[], ${col("timeGo")}::text[], ${col("timeBack")}::text[], ${col("warpId")}::text[], ${col("regDate")}::text[])
      on conflict (code) do update set active = excluded.active, role = excluded.role,
        home = excluded.home, work = excluded.work, region = excluded.region, time_go = excluded.time_go, time_back = excluded.time_back,
        warp_id = excluded.warp_id, reg_date = case when excluded.reg_date = '' then warp_pools.reg_date else excluded.reg_date end, updated_at = now(),
        dup_count = warp_pools.dup_count + 1, last_dup_at = now(),
        -- 주소가 바뀌면 위치를 다시 찾는다
        home_lat = case when warp_pools.home = excluded.home then warp_pools.home_lat end,
        home_lng = case when warp_pools.home = excluded.home then warp_pools.home_lng end,
        work_lat = case when warp_pools.work = excluded.work then warp_pools.work_lat end,
        work_lng = case when warp_pools.work = excluded.work then warp_pools.work_lng end,
        geo_tried_at = case when warp_pools.home = excluded.home and warp_pools.work = excluded.work then warp_pools.geo_tried_at end`;
    for (const r of part) {
      const o = old.get(r.code);
      if (!o) {
        res.added += 1;
        continue;
      }
      res.existing.push(r.code);
      const diff = o.active !== r.active || o.role !== r.role || o.home !== r.home || o.work !== r.work || o.time_go !== r.timeGo || o.time_back !== r.timeBack || String(o.warp_id) !== r.warpId;
      if (diff) {
        res.updated += 1;
        res.changed.push(r.code);
      } else res.same += 1;
    }
  }
  return res;
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
  const qs = [...new Set(tries)].filter((q) => q.split(" ").length >= 2);
  // Photon은 여러 개를 동시에 물어도 된다(먼저), OSM은 1초에 1번씩 줄 세운다
  for (const q of qs.slice(0, 2)) {
    const r = await photonAddress(q, must).catch(() => null);
    if (r) return r;
  }
  for (const q of qs) {
    const r = await osmThrottled(q, must);
    if (r) return r;
  }
  return null;
}
let osmChain: Promise<unknown> = Promise.resolve();
function osmThrottled(q: string, must: string) {
  const run = osmChain.then(() => osmAddress(q, must).catch(() => null));
  osmChain = run.then(() => sleep(1100));
  return run;
}

/**
 * 위치 채우기: 주소 글자를 지도 좌표(위도·경도)로 바꾼다. 좌표가 있어야 거리 매칭·지도에 들어간다.
 * 시간 예산 안에서 4건씩 동시에, 같은 주소는 이미 찾은 좌표를 다시 쓴다. 이번에 찾은 수·못 찾은 수·남은 수를 돌려준다.
 */
export async function fillWarpGeo(budgetMs = 20_000): Promise<{ done: number; found: number; failed: number; left: number }> {
  const sql = db();
  const start = Date.now();
  let done = 0;
  let found = 0;
  const known = async (addr: string) => {
    if (!addr) return null;
    const k = await sql`select lat, lng from (
        select home_lat as lat, home_lng as lng from warp_pools where home = ${addr} and home_lat is not null
        union all select work_lat, work_lng from warp_pools where work = ${addr} and work_lat is not null) t limit 1`;
    return k.length ? { lat: Number(k[0].lat), lng: Number(k[0].lng) } : geocodeAddress(addr);
  };
  while (Date.now() - start < budgetMs - 8000) {
    const rows = await sql`select code, home, work, home_lat, work_lat from warp_pools
      where geo_tried_at is null and (home_lat is null or (work_lat is null and work <> '')) order by reg_date desc, code limit 4`;
    if (!rows.length) break;
    await Promise.all(rows.map(async (x) => {
      const h = x.home_lat == null ? await known(String(x.home)) : null;
      const w = x.work_lat == null && String(x.work) ? (String(x.work) === String(x.home) && h ? h : await known(String(x.work))) : null;
      await sql`update warp_pools set geo_tried_at = now(),
          home_lat = coalesce(home_lat, ${h?.lat ?? null}), home_lng = coalesce(home_lng, ${h?.lng ?? null}),
          work_lat = coalesce(work_lat, ${w?.lat ?? null}), work_lng = coalesce(work_lng, ${w?.lng ?? null})
        where code = ${x.code}`;
      done += 1;
      if ((x.home_lat != null || h) && (!String(x.work) || x.work_lat != null || w)) found += 1;
    }));
  }
  const left = await sql`select count(*)::int as n from warp_pools where geo_tried_at is null and (home_lat is null or (work_lat is null and work <> ''))`;
  return { done, found, failed: done - found, left: Number(left[0].n) };
}

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
  /** 바로 연락 가능: 비밀번호를 정한 회원이거나 최근 30일 안에 접속(모두의카풀 글은 늘 참) */
  live: boolean;
  /** 주소 확인 필요: 자택과 회사 주소가 같음(매칭·글 올리기에서 뺀다) */
  badAddr: boolean;
  /** 앱 카드와 같은 표시: 짧은 이름 + 작은 지역 글씨 */
  homeShort: string; workShort: string; homeArea: string; workArea: string;
  /** 지역 검색용 시·도(서울·경기…)와 시·군·구 */
  homeSido: string; homeSgg: string; workSido: string; workSgg: string;
};

const SIDO: [RegExp, string][] = [
  [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"], [/^광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
  [/^경기/, "경기"], [/^강원/, "강원"], [/^(충북|충청북)/, "충북"], [/^(충남|충청남)/, "충남"], [/^(전북|전라북)/, "전북"], [/^(전남|전라남)/, "전남"],
  [/^(경북|경상북)/, "경북"], [/^(경남|경상남)/, "경남"], [/^제주/, "제주"],
];
/** 주소 글자에서 시·도(짧은 이름)와 시·군·구("성남시 분당구"처럼 둘일 수 있음)를 뽑는다. 앱의 지역 글씨처럼 "경기 성남시 분당구". */
export function regionOf(addr: string): { sido: string; sgg: string; label: string } {
  const parts = addr.replace(/\s+/g, " ").trim().split(" ");
  let i = 0;
  let sido = "";
  const hit = SIDO.find(([re]) => re.test(parts[0] ?? ""));
  if (hit) {
    sido = hit[1];
    i = 1;
  }
  const sgg: string[] = [];
  while (i < parts.length - 1 && sgg.length < 2 && /(시|군|구)$/.test(parts[i])) sgg.push(parts[i++]);
  return { sido, sgg: sgg.join(" "), label: [sido, ...sgg].join(" ") };
}
/** posts.origin_area("서울 마포구 공덕동")에서 시·도와 시·군·구 */
function regionOfArea(area: string, name: string) {
  if (!area) return regionOf(name);
  const r = regionOf(area);
  return { ...r, label: area };
}

/** 주소 비교용: 띄어쓰기·'지하'를 뺀 글자 */
export const addrKey = (a: string) => a.replace(/지하/g, "").replace(/[\s,()]/g, "");
export const sameAddr = (a: string, b: string) => !!a && !!b && addrKey(a) === addrKey(b);

function view(home: string, work: string) {
  const h = regionOf(home);
  const w = regionOf(work);
  return {
    homeShort: shortPlace(home), workShort: work ? shortPlace(work) : "", homeArea: h.label, workArea: work ? w.label : "",
    homeSido: h.sido, homeSgg: h.sgg, workSido: work ? w.sido : "", workSgg: work ? w.sgg : "",
  };
}
function viewPost(origin: string, dest: string, oa: string, da: string) {
  const h = regionOfArea(oa, origin);
  const w = regionOfArea(da, dest);
  return { homeShort: origin, workShort: dest, homeArea: oa, workArea: da, homeSido: h.sido, homeSgg: h.sgg, workSido: w.sido, workSgg: w.sgg };
}

/** 매칭 대상 전체(워프 정기카풀 + 모두의카풀 진행 중 정기카풀 글) */
export async function allPoints(): Promise<PoolPoint[]> {
  const sql = db();
  const [w, p] = await Promise.all([
    sql`select w.*, l.matched_user, u.name, (u.id is not null and u.withdrawn_at is null and (not coalesce(u.pw_reset_required, false) or u.last_seen > now() - interval '30 days')) as live
        from warp_pools w
        left join legacy_members l on upper(l.warp_id) = upper(w.warp_id)
        left join users u on u.id = l.matched_user`,
    sql`select p.id, p.role, p.origin, p.dest, p.origin_area, p.dest_area, p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng, p.time_go, p.time_back, p.user_id, u.name, u.member_code
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
      name: String(x.name ?? ""), active: x.active === true, live: x.live === true, badAddr: sameAddr(String(x.home), String(x.work)),
      ...view(String(x.home), String(x.work)),
    })),
    ...p.map((x) => ({
      kind: "post" as const, ref: String(x.id), role: (x.role === "driver" ? "driver" : "rider") as "driver" | "rider",
      home: String(x.origin), work: String(x.dest), homeLat: n(x.origin_lat), homeLng: n(x.origin_lng), workLat: n(x.dest_lat), workLng: n(x.dest_lng),
      timeGo: String(x.time_go ?? ""), timeBack: String(x.time_back ?? ""), warpId: String(x.member_code ?? ""), userId: String(x.user_id),
      name: String(x.name ?? ""), active: true, live: true, badAddr: false,
      ...viewPost(String(x.origin), String(x.dest), String(x.origin_area ?? ""), String(x.dest_area ?? "")),
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
    if (!o.active || o.badAddr || o.homeLat == null || o.homeLng == null) continue;
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

export type PairMember = PoolPoint & {
  homeKm: number; workKm: number; sumKm: number; goDiff: number | null; backDiff: number | null; detourKm: number | null;
  /** 거리 점수(%): 출발지 거리+도착지 거리 합으로 */
  distPct: number;
  /** 경로 일치율(%): 탑승자가 가는 길 중 운전자 길과 겹치는 비율(옆으로 떨어진 만큼 깎음). 위치가 모자라면 null */
  routePct: number | null;
  /** 종합 가능성(%) = 거리 점수 50% + 경로 일치율 50%(경로를 못 재면 거리 점수만). 시간은 넣지 않는다. */
  chance: number;
  /** 집·회사는 반경 밖이지만 운전자 가는 길 위(돌아가는 거리가 반경 안)라 들어온 후보 */
  onRoute: boolean;
};
export type PairGroup = { driver: PoolPoint; riders: PairMember[]; best: number };
export type Pair = { driver: PoolPoint; rider: PairMember };
export type PairSort = "score" | "sum" | "detour" | "route" | "time";

const mins = (t: string) => (/^\d{1,2}:\d{2}$/.test(t) ? Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]) : null);
/** 두 시각의 차(분). 하나라도 비어 있으면 null. 자정을 넘는 차는 짧은 쪽으로 잰다. */
function timeDiff(a: string, b: string) {
  const x = mins(a);
  const y = mins(b);
  if (x == null || y == null) return null;
  const d = Math.abs(x - y);
  return Math.min(d, 1440 - d);
}

/** 위경도를 기준점 둘레의 평면 km 좌표로(가까운 거리라 충분히 정확) */
function plane(lat0: number, lat: number, lng: number): [number, number] {
  return [lng * 111.32 * Math.cos((lat0 * Math.PI) / 180), lat * 110.57];
}

/**
 * 돌아가는 거리(km, 직선): 운전자가 탑승자 집 → 탑승자 회사를 들렀다 갈 때 더 가는 길.
 * d(운전자 집→탑승자 집) + d(탑승자 집→탑승자 회사) + d(탑승자 회사→운전자 회사) − d(운전자 집→운전자 회사). 위치가 하나라도 없으면 null.
 */
function detourOf(d: PoolPoint, r: PoolPoint): number | null {
  if (d.homeLat == null || d.homeLng == null || d.workLat == null || d.workLng == null) return null;
  if (r.homeLat == null || r.homeLng == null || r.workLat == null || r.workLng == null) return null;
  const v = km(d.homeLat, d.homeLng, r.homeLat, r.homeLng) + km(r.homeLat, r.homeLng, r.workLat, r.workLng)
    + km(r.workLat, r.workLng, d.workLat, d.workLng) - km(d.homeLat, d.homeLng, d.workLat, d.workLng);
  return Math.max(0, Math.round(v * 10) / 10);
}

/**
 * 경로 일치율(0~1): 탑승자 집·회사를 운전자 길(집→회사 선분) 위에 비춰 겹치는 길이 ÷ 탑승자 이동 거리,
 * 그리고 두 점이 운전자 길에서 옆으로 떨어진 거리(큰 쪽)가 반경만큼이면 0이 되도록 깎는다. 반대 방향이면 0.
 */
export function routeMatch(d: PoolPoint, r: PoolPoint, radiusKm: number): number | null {
  if (d.homeLat == null || d.homeLng == null || d.workLat == null || d.workLng == null) return null;
  if (r.homeLat == null || r.homeLng == null || r.workLat == null || r.workLng == null) return null;
  const lat0 = d.homeLat;
  const A = plane(lat0, d.homeLat, d.homeLng);
  const B = plane(lat0, d.workLat, d.workLng);
  const P = plane(lat0, r.homeLat, r.homeLng);
  const Q = plane(lat0, r.workLat, r.workLng);
  const ab: [number, number] = [B[0] - A[0], B[1] - A[1]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1];
  const Lr = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  if (L2 < 0.01 || Lr < 0.3) return null;
  const L = Math.sqrt(L2);
  const t = (X: [number, number]) => ((X[0] - A[0]) * ab[0] + (X[1] - A[1]) * ab[1]) / L2;
  const off = (X: [number, number]) => {
    const k = Math.max(0, Math.min(1, t(X)));
    return Math.hypot(X[0] - (A[0] + ab[0] * k), X[1] - (A[1] + ab[1] * k));
  };
  const t1 = Math.max(0, Math.min(1, t(P)));
  const t2 = Math.max(0, Math.min(1, t(Q)));
  if (t2 <= t1) return 0;
  const cover = Math.min(1, ((t2 - t1) * L) / Lr);
  const side = Math.max(0, 1 - Math.max(off(P), off(Q)) / Math.max(1, radiusKm));
  return cover * side;
}

/**
 * 운전자 한 명과 탑승자 한 명. 후보 = 출발지·도착지가 모두 반경 안이거나, 돌아가는 거리가 반경 안(가는 길 위)인 쌍.
 * 도착지가 없는 글은 출발지 거리만으로(합에는 출발지 거리를 두 번 센다).
 */
function measure(d: PoolPoint, r: PoolPoint, radiusKm: number): PairMember | null {
  if (d.userId && r.userId === d.userId) return null;
  const homeKm = km(d.homeLat as number, d.homeLng as number, r.homeLat as number, r.homeLng as number);
  const both = d.workLat != null && d.workLng != null && r.workLat != null && r.workLng != null;
  const workKm = both ? km(d.workLat as number, d.workLng as number, r.workLat as number, r.workLng as number) : -1;
  const near = homeKm <= radiusKm && workKm <= radiusKm;
  if (!near && homeKm > radiusKm * 6) return null; // 너무 먼 쌍은 계산하지 않는다
  const detourKm = both ? detourOf(d, r) : null;
  if (!near && (detourKm == null || detourKm > radiusKm)) return null;
  const sum = homeKm + (workKm < 0 ? homeKm : workKm);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  // 거리 점수: 합이 0이면 100, 둘 다 반경 끝(합 = 2×반경)이면 0. 가는 길 위 후보는 돌아가는 거리로 대신 잰다.
  const distRaw = near ? 1 - sum / (2 * radiusKm) : 1 - (detourKm as number) / radiusKm;
  const distPct = Math.max(1, Math.round(100 * distRaw));
  const rm = routeMatch(d, r, radiusKm);
  const routePct = rm == null ? null : Math.round(100 * rm);
  const chance = Math.max(1, routePct == null ? distPct : Math.round((distPct + routePct) / 2));
  return {
    ...r, homeKm: r1(homeKm), workKm: workKm < 0 ? -1 : r1(workKm), sumKm: r1(sum), detourKm,
    goDiff: timeDiff(d.timeGo, r.timeGo), backDiff: timeDiff(d.timeBack, r.timeBack), distPct, routePct, chance, onRoute: !near,
  };
}
const usable = (p: PoolPoint) => p.active && !p.badAddr && p.homeLat != null && p.homeLng != null;

/** 정렬 기준값(작을수록 앞) */
function sortKey(m: PairMember, sort: PairSort): number {
  switch (sort) {
    case "sum": return m.sumKm;
    case "detour": return m.detourKm ?? 999;
    case "route": return -(m.routePct ?? -1) * 1000 - m.chance;
    case "time": return (m.goDiff ?? 9999) * 1000 + (m.backDiff ?? 999);
    default: return -m.chance * 1000 + m.sumKm;
  }
}

export type RegionFilter = { from?: string; fromGu?: string; to?: string; toGu?: string };
const inRegion = (sido: string, sgg: string, want?: string, gu?: string) => (!want || sido === want) && (!gu || sgg.includes(gu));
/** 지역 조건: 출발 지역은 집, 도착 지역은 회사 기준. 운전자·탑승자 둘 중 한 명이라도 맞으면 보여 준다. */
function pairInRegion(d: PoolPoint, r: PoolPoint, f: RegionFilter) {
  const ok = (p: PoolPoint) => inRegion(p.homeSido, p.homeSgg, f.from, f.fromGu) && inRegion(p.workSido, p.workSgg, f.to, f.toGu);
  return ok(d) || ok(r);
}
const hasRegion = (f: RegionFilter) => !!(f.from || f.fromGu || f.to || f.toGu);

function allPairs(all: PoolPoint[], radiusKm: number, f: RegionFilter) {
  const drivers = all.filter((p) => usable(p) && p.role === "driver");
  const riders = all.filter((p) => usable(p) && p.role === "rider");
  const out: Pair[] = [];
  const reg = hasRegion(f);
  for (const d of drivers) for (const r of riders) {
    if (reg && !pairInRegion(d, r, f)) continue;
    const m = measure(d, r, radiusKm);
    if (m) out.push({ driver: d, rider: m });
  }
  return out;
}

/**
 * 매칭 묶음: 운전자마다 고른 기준으로 가장 좋은 탑승자 1~2명, 묶음은 그 첫 탑승자 기준 순.
 * 위치가 있는 사용 중 글만, 같은 계정끼리는 제외. 시간은 점수에 넣지 않고 차이만 함께 돌려준다.
 */
export function pairGroups(all: PoolPoint[], radiusKm: number, perDriver = 2, sort: PairSort = "score", f: RegionFilter = {}, limit = 150): PairGroup[] {
  const by = new Map<string, { driver: PoolPoint; list: PairMember[] }>();
  for (const p of allPairs(all, radiusKm, f)) {
    const k = `${p.driver.kind}:${p.driver.ref}`;
    const g = by.get(k);
    if (g) g.list.push(p.rider);
    else by.set(k, { driver: p.driver, list: [p.rider] });
  }
  const groups: PairGroup[] = [];
  for (const { driver, list } of by.values()) {
    list.sort((a, b) => sortKey(a, sort) - sortKey(b, sort));
    const top = list.slice(0, perDriver);
    groups.push({ driver, riders: top, best: top[0].chance });
  }
  return groups.sort((a, b) => sortKey(a.riders[0], sort) - sortKey(b.riders[0], sort)).slice(0, limit);
}

/** 전체 쌍: 후보가 되는 모든 운전자·탑승자 쌍을 고른 기준으로. */
export function pairList(all: PoolPoint[], radiusKm: number, sort: PairSort = "score", f: RegionFilter = {}, limit = 500): Pair[] {
  return allPairs(all, radiusKm, f).sort((a, b) => sortKey(a.rider, sort) - sortKey(b.rider, sort)).slice(0, limit);
}

/** 지역 고르는 칸에 보여 줄 인원: 사용 중·위치 있는 글의 집(출발)·회사(도착) 시·도별, 시·군·구별 */
export function regionCounts(all: PoolPoint[]) {
  const from: Record<string, Record<string, number>> = {};
  const to: Record<string, Record<string, number>> = {};
  const add = (m: Record<string, Record<string, number>>, sido: string, sgg: string) => {
    if (!sido) return;
    m[sido] ??= { "": 0 };
    m[sido][""] += 1;
    if (sgg) m[sido][sgg] = (m[sido][sgg] ?? 0) + 1;
  };
  for (const p of all) {
    if (!usable(p)) continue;
    add(from, p.homeSido, p.homeSgg);
    add(to, p.workSido, p.workSgg);
  }
  return { from, to };
}

export type Workplace = { place: string; n: number; drivers: number; riders: number; members: PoolPoint[] };

/** 같은 회사 묶음: 사용 중 워프 글을 회사 주소(띄어쓰기·'지하' 무시)가 같은 것끼리. 많은 순. */
export function workplaces(all: PoolPoint[], min = 2): Workplace[] {
  const map = new Map<string, PoolPoint[]>();
  for (const p of all) {
    if (p.kind !== "warp" || !p.active || p.badAddr || !p.work) continue;
    const k = addrKey(p.work);
    const list = map.get(k);
    if (list) list.push(p);
    else map.set(k, [p]);
  }
  const out: Workplace[] = [];
  for (const list of map.values()) {
    if (list.length < min) continue;
    const drivers = list.filter((x) => x.role === "driver").length;
    list.sort((a, b) => (a.role === b.role ? Number(b.live) - Number(a.live) : a.role === "driver" ? -1 : 1));
    out.push({ place: list[0].work, n: list.length, drivers, riders: list.length - drivers, members: list });
  }
  return out.sort((a, b) => b.n - a.n || a.drivers - b.drivers);
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
      : sameAddr(String(w.home), String(w.work)) ? "출발·도착 주소 같음(주소 확인 필요)"
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
