import { sendPush } from "./push";
import { db } from "./server";
import { detourOf, km, routeMatch } from "./match";
import { regionOf, sameAddr, shortPlace } from "./warpPool";

/**
 * 새 카풀 글의 매칭 가능성 있는 회원(2026-11-06 사용자 지시).
 * - 내 글과 반대 역할의 진행 중 글(공개된 글만)을 정기 매칭과 같은 거리·경로 일치 점수로 고른다.
 * - 지금은 무료. 회원이 많아지면 settings `match_view_cost`(크레딧)를 올려 유료로 — 같은 글은 한 번 내면 다시 볼 때 무료(`match_views`).
 * - 새 글이 올라오면 점수 MATCH_NOTIFY_MIN 이상인 기존 글쓴이에게 알림함·푸시(하루 MATCH_NOTIFY_DAILY번까지). 메일은 추후 검토.
 * - 2026-11-07 사용자 지시: 글로 안 올린 워프 정기카풀(warp_pools)도 후보로 보여 준다('워프 회원 · 앱 가입 전', 누를 수 없음).
 *   워프는 출근(집→회사, 출근 시각)·퇴근(회사→집, 퇴근 시각) 두 방향 중 맞는 쪽, 평일(월~금). 요일·시각(±30분)이 맞으면 위로.
 */
export const MATCH_RADIUS_KM = 3; // 화면의 내 글 매칭(lib/postMatch.ts)과 같은 반경
export const MATCH_NOTIFY_MIN = 70;
export const MATCH_NOTIFY_DAILY = 3;
const MAX_ITEMS = 30;

type P = {
  id: string; userId: string; role: "driver" | "rider"; regular: boolean; days: string; timeGo: string; departAt: number;
  origin: string; dest: string; oArea: string; dArea: string; code: string; photoV: number;
  homeLat: number; homeLng: number; workLat: number | null; workLng: number | null;
  warp?: boolean;
};
export type Match = {
  postId: string; userId: string; code: string; photoV: number; role: "driver" | "rider"; regular: boolean;
  origin: string; dest: string; oArea: string; dArea: string; departAt: number; days: string; timeGo: string;
  chance: number; homeKm: number; workKm: number; onRoute: boolean; timeDiff: number | null;
  /** 워프 정기카풀(앱 가입 전, 글 없음) */ warp: boolean;
  /** 요일이 겹치는지(알 수 없으면 null) */ dayOk: boolean | null;
  /** 요일이 맞고 시각 차 30분 이내 */ timeFit: boolean;
  /** 지도에 경로를 그리기 위한 출발·도착 좌표 */ oLat: number; oLng: number; dLat: number | null; dLng: number | null;
};
const TIME_FIT_MIN = 30;

const n = (v: unknown) => (v == null ? null : Number(v));
function toP(r: Record<string, unknown>): P | null {
  const oLat = n(r.origin_lat), oLng = n(r.origin_lng);
  if (oLat == null || oLng == null) return null;
  return {
    id: String(r.id), userId: String(r.user_id), role: r.role === "driver" ? "driver" : "rider", regular: r.regular === true,
    days: String(r.days ?? ""), timeGo: String(r.time_go ?? ""), departAt: new Date(r.depart_at as string).getTime(),
    origin: String(r.origin), dest: String(r.dest), oArea: String(r.origin_area ?? ""), dArea: String(r.dest_area ?? ""),
    code: String(r.member_code ?? ""), photoV: Number(r.photo_v) || 0,
    homeLat: oLat, homeLng: oLng, workLat: n(r.dest_lat), workLng: n(r.dest_lng),
  };
}

/** 한국 시각 HH:MM(정기 글은 time_go, 1회 글은 출발 시각) */
function hm(p: P) {
  if (p.regular) return /^\d{1,2}:\d{2}$/.test(p.timeGo) ? p.timeGo : "";
  const k = new Date(p.departAt + 9 * 3600_000);
  return `${k.getUTCHours()}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}
function minsOf(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function timeDiff(a: P, b: P) {
  const ta = hm(a), tb = hm(b);
  if (!/^\d{1,2}:\d{2}$/.test(ta) || !/^\d{1,2}:\d{2}$/.test(tb)) return null;
  const d = Math.abs(minsOf(ta) - minsOf(tb));
  return Math.min(d, 1440 - d);
}
/** 요일(0=일~6=토): 정기 글은 days, 1회 글은 출발한 날의 요일 */
function daysOf(p: P) {
  if (p.regular) return p.days;
  return String(new Date(p.departAt + 9 * 3600_000).getUTCDay());
}
function dayOk(a: P, b: P): boolean | null {
  const da = daysOf(a), db_ = daysOf(b);
  if (!da || !db_) return null;
  if (!a.regular && !b.regular) return null; // 1회끼리는 날짜가 따로 있어 시각만 본다
  return [...da].some((d) => db_.includes(d));
}

/**
 * 글로 안 올린 워프 정기카풀(사용 중·위치 있음·자택≠회사, 내 워프 행 제외). 내 출발지 근처(약 18km)인 것만 DB에서 고른다.
 * 출근 방향(집→회사, 출근 시각)과 퇴근 방향(회사→집, 퇴근 시각) 두 개로 만들어 둘 다 점수를 내 본다.
 */
async function warpPoints(me: string, lat: number, lng: number): Promise<P[]> {
  const dLat = 0.17, dLng = 0.21;
  const rows = await db()`select w.code, w.role, w.home, w.work, w.home_lat, w.home_lng, w.work_lat, w.work_lng, w.time_go, w.time_back
    from warp_pools w
    where w.active and w.post_id is null and w.home_lat is not null and w.work_lat is not null and w.work <> ''
      and ((w.home_lat between ${lat - dLat} and ${lat + dLat} and w.home_lng between ${lng - dLng} and ${lng + dLng})
        or (w.work_lat between ${lat - dLat} and ${lat + dLat} and w.work_lng between ${lng - dLng} and ${lng + dLng}))
      and not exists (select 1 from legacy_members l where upper(l.warp_id) = upper(w.warp_id) and w.warp_id <> '' and l.matched_user = ${me})
    limit 4000`;
  const out: P[] = [];
  for (const r of rows) {
    const home = String(r.home), work = String(r.work);
    if (sameAddr(home, work)) continue;
    const base = { userId: "", role: (r.role === "driver" ? "driver" : "rider") as P["role"], regular: true, days: "12345", departAt: 0, code: "", photoV: 0, warp: true };
    const hLat = Number(r.home_lat), hLng = Number(r.home_lng), wLat = Number(r.work_lat), wLng = Number(r.work_lng);
    out.push({ ...base, id: `w-${r.code}-go`, timeGo: String(r.time_go ?? ""), origin: shortPlace(home), dest: shortPlace(work),
      oArea: regionOf(home).label, dArea: regionOf(work).label, homeLat: hLat, homeLng: hLng, workLat: wLat, workLng: wLng });
    out.push({ ...base, id: `w-${r.code}-back`, timeGo: String(r.time_back ?? ""), origin: shortPlace(work), dest: shortPlace(home),
      oArea: regionOf(work).label, dArea: regionOf(home).label, homeLat: wLat, homeLng: wLng, workLat: hLat, workLng: hLng });
  }
  return out;
}

/** 운전자 d·탑승자 r 한 쌍의 점수. 정기 매칭(lib/warpPool.ts measure)과 같은 규칙. 후보가 아니면 null */
function score(d: P, r: P, radiusKm: number) {
  const homeKm = km(d.homeLat, d.homeLng, r.homeLat, r.homeLng);
  const both = d.workLat != null && d.workLng != null && r.workLat != null && r.workLng != null;
  const workKm = both ? km(d.workLat as number, d.workLng as number, r.workLat as number, r.workLng as number) : -1;
  if (!both) return null; // 도착지가 없으면 같은 길인지 알 수 없다
  const near = homeKm <= radiusKm && workKm <= radiusKm;
  if (!near && homeKm > radiusKm * 6) return null;
  const detourKm = detourOf(d, r);
  if (!near && (detourKm == null || detourKm > radiusKm)) return null;
  const sum = homeKm + workKm;
  const distRaw = near ? 1 - sum / (2 * radiusKm) : 1 - (detourKm as number) / radiusKm;
  const distPct = Math.max(1, Math.round(100 * distRaw));
  const rm = routeMatch(d, r, radiusKm);
  const chance = Math.max(1, rm == null ? distPct : Math.round((distPct + Math.round(100 * rm)) / 2));
  return { chance, homeKm: Math.round(homeKm * 10) / 10, workKm: Math.round(workKm * 10) / 10, onRoute: !near };
}

/** 진행 중인 공개 글(정기 글, 또는 아직 출발 전인 1회 글). 임시글·테스트·탈퇴·차단 회원 제외 */
async function openPosts(exceptUser: string) {
  const rows = await db()`select p.id, p.user_id, p.role, p.regular, p.days, p.time_go, p.depart_at, p.origin, p.dest, p.origin_area, p.dest_area,
      p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng, u.member_code, u.photo_v
    from posts p join users u on u.id = p.user_id
    where p.status = 'open' and not coalesce(p.demo, false) and not u.test and not u.blocked and u.withdrawn_at is null
      and p.user_id <> ${exceptUser} and (p.regular or p.depart_at > now())
      and p.origin_lat is not null and p.dest_lat is not null
      and not exists (select 1 from blocks b where (b.blocker = ${exceptUser} and b.blocked = p.user_id) or (b.blocker = p.user_id and b.blocked = ${exceptUser}))
    order by p.created_at desc limit 3000`;
  return rows.map(toP).filter((x): x is P => !!x);
}

async function loadPost(postId: string) {
  const r = await db()`select p.id, p.user_id, p.role, p.regular, p.days, p.time_go, p.depart_at, p.origin, p.dest, p.origin_area, p.dest_area,
      p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng, u.member_code, u.photo_v
    from posts p join users u on u.id = p.user_id where p.id = ${postId}`;
  return r.length ? toP(r[0]) : null;
}

/** 이 글과 매칭 가능성 있는 다른 회원의 글(점수 높은 순, 회원당 가장 높은 글 하나) */
export async function matchesFor(postId: string): Promise<{ mine: P | null; items: Match[] }> {
  const mine = await loadPost(postId);
  if (!mine || mine.workLat == null) return { mine, items: [] };
  const [posts, warps] = await Promise.all([openPosts(mine.userId), warpPoints(mine.userId, mine.homeLat, mine.homeLng).catch(() => [] as P[])]);
  const best = new Map<string, Match>();
  for (const o of [...posts, ...warps]) {
    if (o.role === mine.role) continue;
    const s = mine.role === "driver" ? score(mine, o, MATCH_RADIUS_KM) : score(o, mine, MATCH_RADIUS_KM);
    if (!s) continue;
    const td = timeDiff(mine, o);
    const dk = dayOk(mine, o);
    const m: Match = {
      postId: o.warp ? "" : o.id, userId: o.userId, code: o.code, photoV: o.photoV, role: o.role, regular: o.regular,
      origin: o.origin, dest: o.dest, oArea: o.oArea, dArea: o.dArea, departAt: o.departAt, days: o.days, timeGo: o.timeGo,
      ...s, timeDiff: td, warp: !!o.warp, dayOk: dk, timeFit: td != null && td <= TIME_FIT_MIN && dk !== false,
      oLat: o.homeLat, oLng: o.homeLng, dLat: o.workLat, dLng: o.workLng,
    };
    // 같은 회원(워프는 같은 코드)의 여러 글·방향 중 가장 맞는 것 하나
    const key = o.warp ? o.id.replace(/-(go|back)$/, "") : o.userId;
    const prev = best.get(key);
    if (!prev || rank(m) > rank(prev)) best.set(key, m);
  }
  const items = [...best.values()].sort((a, b) => rank(b) - rank(a) || (a.timeDiff ?? 999) - (b.timeDiff ?? 999)).slice(0, MAX_ITEMS);
  return { mine, items };
}
/** 정렬: 시간·요일 맞는 것 먼저, 앱 회원(바로 연락 가능)을 워프 회원보다 조금 위, 그다음 점수 */
const rank = (m: Match) => (m.timeFit ? 1000 : 0) + (m.dayOk === false ? -500 : 0) + (m.warp ? 0 : 5) + m.chance;

/** 열람 비용(크레딧). 0이면 무료. 관리자가 settings `match_view_cost`로 바꾼다. */
export async function matchViewCost() {
  const r = await db()`select value from settings where key = 'match_view_cost'`;
  const v = Number(r[0]?.value);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/**
 * 새 글이 올라왔을 때: 점수 높은(MATCH_NOTIFY_MIN 이상) 상대 글쓴이에게 알림함·푸시.
 * 한 사람에게 하루 MATCH_NOTIFY_DAILY번까지(오늘 받은 'match-' 알림 수로 센다). 메일은 보내지 않는다(추후 검토).
 */
export async function notifyMatches(postId: string) {
  const { mine, items } = await matchesFor(postId);
  if (!mine) return 0;
  const sql = db();
  let sent = 0;
  for (const m of items) {
    if (m.warp || !m.userId) continue; // 워프 회원(앱 가입 전)은 알림 대상이 아님
    if (m.chance < MATCH_NOTIFY_MIN) continue;
    const today = await sql`select count(*)::int as n from user_alerts where user_id = ${m.userId} and tag like 'match-%'
      and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`;
    if ((Number(today[0]?.n) || 0) >= MATCH_NOTIFY_DAILY) continue;
    // 같은 글로 이미 다른 알림(예: '근처에서 탑승자가 카풀을 찾아요')을 받았으면 또 보내지 않는다
    const dup = await sql`select 1 from user_alerts where user_id = ${m.userId} and url = ${`/?p=${mine.id}`} and created_at > now() - interval '1 day' limit 1`;
    if (dup.length) continue;
    const who = mine.role === "driver" ? "운전자" : "탑승자";
    await sendPush(m.userId, {
      title: `같은 길 ${who} 카풀이 새로 올라왔어요`,
      body: `매칭 ${m.chance}% · ${mine.origin} → ${mine.dest}`,
      url: `/?p=${mine.id}`,
      tag: `match-${mine.id}`,
    });
    sent++;
  }
  return sent;
}

/**
 * 찾기 지도 분석(2026-11-07 사용자 지시 1·3·4·5): 고른 글 기준으로
 * ① 같은 길 운전자·탑승자 수와 상대 역할의 출발 시각대 ④ 같은 길 탑승자가 3명 이상 모이는 500m 칸(칸 가운데·인원만)
 * ⑤ 도착지 300m 안으로 가는 회원 수 ③ 예상 거리(직선 × 1.3). 사람마다 하나로 센다(워프는 코드, 앱은 회원).
 */
export type Insights = {
  km: number;
  drivers: number; riders: number;
  /** 상대 역할의 출발 시각(시) → 인원 */ hours: Record<string, number>;
  spots: { lat: number; lng: number; n: number }[];
  dest: { drivers: number; riders: number };
};
const CELL_LAT = 0.0045, CELL_LNG = 0.0056; // 약 500m
export async function routeInsights(postId: string): Promise<Insights | null> {
  const mine = await loadPost(postId);
  if (!mine || mine.workLat == null || mine.workLng == null) return null;
  const [posts, warps] = await Promise.all([openPosts(mine.userId), warpPoints(mine.userId, mine.homeLat, mine.homeLng).catch(() => [] as P[])]);
  const keyOf = (o: P) => (o.warp ? o.id.replace(/-(go|back)$/, "") : o.userId);
  const same = new Map<string, P>();
  for (const o of [...posts, ...warps]) {
    const k = keyOf(o);
    if (same.has(k)) continue;
    const ok = score(mine, o, MATCH_RADIUS_KM) || score(o, mine, MATCH_RADIUS_KM);
    if (ok) same.set(k, o);
  }
  const list = [...same.values()];
  const other = mine.role === "driver" ? "rider" : "driver";
  const hours: Record<string, number> = {};
  for (const o of list) {
    if (o.role !== other) continue;
    const t = hm(o);
    if (!t) continue;
    const h = String(Number(t.split(":")[0]));
    hours[h] = (hours[h] ?? 0) + 1;
  }
  const cells = new Map<string, number>();
  for (const o of list) {
    if (o.role !== "rider") continue;
    const k = `${Math.floor(o.homeLat / CELL_LAT)}:${Math.floor(o.homeLng / CELL_LNG)}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  const spots = [...cells].filter(([, n]) => n >= 3).map(([k, n]) => {
    const [a, b] = k.split(":").map(Number);
    return { lat: (a + 0.5) * CELL_LAT, lng: (b + 0.5) * CELL_LNG, n };
  }).sort((x, y) => y.n - x.n).slice(0, 8);

  // ⑤ 도착지 300m 안(경로와 상관없이): 앱 글 + 워프 정기카풀(회사)
  const dLat = mine.workLat, dLng = mine.workLng;
  const bl = 0.0032, bn = 0.004;
  const [dp, dw] = await Promise.all([
    db()`select p.user_id, p.role, p.dest_lat, p.dest_lng from posts p join users u on u.id = p.user_id
      where p.status = 'open' and not coalesce(p.demo, false) and not u.test and not u.blocked and u.withdrawn_at is null
        and p.user_id <> ${mine.userId} and (p.regular or p.depart_at > now())
        and p.dest_lat between ${dLat - bl} and ${dLat + bl} and p.dest_lng between ${dLng - bn} and ${dLng + bn}`,
    db()`select code, role, work_lat, work_lng from warp_pools
      where active and post_id is null and work_lat between ${dLat - bl} and ${dLat + bl} and work_lng between ${dLng - bn} and ${dLng + bn}`,
  ]);
  const near = new Map<string, string>();
  for (const r of dp) if (km(dLat, dLng, Number(r.dest_lat), Number(r.dest_lng)) <= 0.3) near.set(`u${r.user_id}`, String(r.role));
  for (const r of dw) if (km(dLat, dLng, Number(r.work_lat), Number(r.work_lng)) <= 0.3) near.set(`w${r.code}`, String(r.role));
  const roles = [...near.values()];
  return {
    km: Math.round(km(mine.homeLat, mine.homeLng, dLat, dLng) * 1.3 * 10) / 10,
    drivers: list.filter((o) => o.role === "driver").length,
    riders: list.filter((o) => o.role === "rider").length,
    hours, spots,
    dest: { drivers: roles.filter((r) => r === "driver").length, riders: roles.filter((r) => r === "rider").length },
  };
}
