import { currentUserId, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 현재 위치에서 가까운 지하철역(?lat=&lng=). 카카오 로컬 '지하철역' 분류(SW8)로 반경 2km 안을 거리순으로 찾고, 실패하거나 없으면 오픈스트리트맵(Overpass)으로 다시 찾는다.
 * 위치는 저장하지 않는다. 키가 없거나 실패하면 빈 목록과 안내 문구를 돌려준다.
 */
type Near = { station: string; line: string; distance: number; walkMin: number };

const hits = new Map<string, { n: number; t: number }>();
function limited(id: string): boolean {
  const now = Date.now();
  const h = hits.get(id);
  if (!h || now - h.t > 60_000) {
    if (hits.size > 5000) hits.clear();
    hits.set(id, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > 20;
}

/** "장한평역 5호선" → { station: "장한평", line: "5호선" } */
function parsePlace(name: string): { station: string; line: string } {
  const m = /^(.+?)역(?:\([^)]*\))?(?:\s+(.+))?$/.exec(name.trim());
  if (!m) return { station: name.trim(), line: "" };
  return { station: m[1].trim(), line: (m[2] ?? "").trim() };
}

export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: "위치 정보가 올바르지 않아요." }, 400);
  }
  if (limited(me)) return json({ error: "잠시 후 다시 시도해 주세요." }, 429);
  const key = process.env.KAKAO_REST_KEY;
  let reason = "";
  // 1) 카카오 지하철역 분류(SW8)
  if (key) {
    try {
      const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&x=${lng}&y=${lat}&radius=2000&sort=distance&size=15`;
      const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        reason = `kakao ${res.status}`;
        console.error("[seat/near] kakao", res.status, (await res.text().catch(() => "")).slice(0, 200));
      } else {
        const d = await res.json();
        const items = merge(
          ((d.documents ?? []) as Record<string, string>[]).map((x) => ({ ...parsePlace(String(x.place_name ?? "")), distance: Math.round(Number(x.distance) || 0) })),
        );
        if (items.length) return json({ items });
        reason = "kakao 0";
      }
    } catch (e) {
      reason = "kakao error";
      console.error("[seat/near] kakao", e);
    }
  } else reason = "no key";
  // 2) 오픈스트리트맵(Overpass) 지하철역으로 다시 찾기
  try {
    const q = `[out:json][timeout:8];(node["railway"="station"]["station"="subway"](around:2000,${lat},${lng});node["railway"="station"]["subway"="yes"](around:2000,${lat},${lng});node["public_transport"="station"]["subway"="yes"](around:2000,${lat},${lng}););out body 30;`;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "modu-carpool/1.0 (https://moducarpool.com)" },
      body: "data=" + encodeURIComponent(q),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const d = await res.json();
    type N = { lat: number; lon: number; tags?: Record<string, string> };
    const items = merge(
      ((d.elements ?? []) as N[]).map((n) => {
        const name = (n.tags?.["name:ko"] || n.tags?.name || "").replace(/역$/, "").trim();
        const line = n.tags?.line || n.tags?.["subway:line"] || "";
        return { station: name, line, distance: Math.round(meters(lat, lng, n.lat, n.lon)) };
      }),
    );
    if (items.length) return json({ items, source: "osm" });
  } catch (e) {
    reason += reason ? " · osm error" : "osm error";
    console.error("[seat/near] osm", e);
  }
  return json({ items: [], note: reason.includes("error") || /\d{3}/.test(reason) ? "가까운 역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : "2km 안에 지하철역이 없어요.", reason });
}

/** 같은 역은 한 줄로 합치고(노선은 ·로 잇기) 가까운 순 3곳 */
function merge(list: { station: string; line: string; distance: number }[]): Near[] {
  const seen = new Map<string, Near>();
  for (const x of list.filter((v) => v.station).sort((a, b) => a.distance - b.distance)) {
    const prev = seen.get(x.station);
    if (prev) {
      if (x.line && !prev.line.split("·").includes(x.line)) prev.line = [prev.line, x.line].filter(Boolean).join("·");
      continue;
    }
    seen.set(x.station, { station: x.station, line: x.line, distance: x.distance, walkMin: Math.max(1, Math.round(x.distance / 70)) });
  }
  return [...seen.values()].slice(0, 3);
}

function meters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = Math.PI / 180;
  const x = (lng2 - lng1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
