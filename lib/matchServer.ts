import { sendPush } from "./push";
import { db } from "./server";
import { detourOf, km, routeMatch } from "./match";

/**
 * 새 카풀 글의 매칭 가능성 있는 회원(2026-11-06 사용자 지시).
 * - 내 글과 반대 역할의 진행 중 글(공개된 글만)을 정기 매칭과 같은 거리·경로 일치 점수로 고른다.
 * - 지금은 무료. 회원이 많아지면 settings `match_view_cost`(크레딧)를 올려 유료로 — 같은 글은 한 번 내면 다시 볼 때 무료(`match_views`).
 * - 새 글이 올라오면 점수 MATCH_NOTIFY_MIN 이상인 기존 글쓴이에게 알림함·푸시(하루 MATCH_NOTIFY_DAILY번까지). 메일은 추후 검토.
 */
export const MATCH_RADIUS_KM = 3; // 화면의 내 글 매칭(lib/postMatch.ts)과 같은 반경
export const MATCH_NOTIFY_MIN = 70;
export const MATCH_NOTIFY_DAILY = 3;
const MAX_ITEMS = 30;

type P = {
  id: string; userId: string; role: "driver" | "rider"; regular: boolean; days: string; timeGo: string; departAt: number;
  origin: string; dest: string; oArea: string; dArea: string; code: string; photoV: number;
  homeLat: number; homeLng: number; workLat: number | null; workLng: number | null;
};
export type Match = {
  postId: string; userId: string; code: string; photoV: number; role: "driver" | "rider"; regular: boolean;
  origin: string; dest: string; oArea: string; dArea: string; departAt: number; days: string; timeGo: string;
  chance: number; homeKm: number; workKm: number; onRoute: boolean; timeDiff: number | null;
};

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
  if (p.regular && /^\d{1,2}:\d{2}$/.test(p.timeGo)) return p.timeGo;
  const k = new Date(p.departAt + 9 * 3600_000);
  return `${k.getUTCHours()}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}
function minsOf(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function timeDiff(a: P, b: P) {
  const d = Math.abs(minsOf(hm(a)) - minsOf(hm(b)));
  return Math.min(d, 1440 - d);
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
  const others = await openPosts(mine.userId);
  const best = new Map<string, Match>();
  for (const o of others) {
    if (o.role === mine.role) continue;
    const s = mine.role === "driver" ? score(mine, o, MATCH_RADIUS_KM) : score(o, mine, MATCH_RADIUS_KM);
    if (!s) continue;
    const m: Match = {
      postId: o.id, userId: o.userId, code: o.code, photoV: o.photoV, role: o.role, regular: o.regular,
      origin: o.origin, dest: o.dest, oArea: o.oArea, dArea: o.dArea, departAt: o.departAt, days: o.days, timeGo: o.timeGo,
      ...s, timeDiff: timeDiff(mine, o),
    };
    const prev = best.get(o.userId);
    if (!prev || prev.chance < m.chance) best.set(o.userId, m);
  }
  const items = [...best.values()].sort((a, b) => b.chance - a.chance || (a.timeDiff ?? 999) - (b.timeDiff ?? 999)).slice(0, MAX_ITEMS);
  return { mine, items };
}

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
    if (m.chance < MATCH_NOTIFY_MIN) break;
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
