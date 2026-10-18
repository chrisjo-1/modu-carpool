import { currentUserId, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 현재 위치에서 가까운 지하철역(?lat=&lng=). 카카오 로컬 '지하철역' 분류(SW8)로 반경 1.5km 안을 거리순으로 찾는다.
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
  if (!key) return json({ items: [], note: "가까운 역 찾기를 준비 중이에요." });
  try {
    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&x=${lng}&y=${lat}&radius=1500&sort=distance&size=15`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const d = await res.json();
    const seen = new Map<string, Near>();
    for (const x of (d.documents ?? []) as Record<string, string>[]) {
      const { station, line } = parsePlace(String(x.place_name ?? ""));
      if (!station) continue;
      const distance = Math.round(Number(x.distance) || 0);
      const prev = seen.get(station);
      // 같은 역의 여러 노선은 한 줄로 합친다(가까운 거리 기준).
      if (prev) {
        if (line && !prev.line.split("·").includes(line)) prev.line = [prev.line, line].filter(Boolean).join("·");
        continue;
      }
      seen.set(station, { station, line, distance, walkMin: Math.max(1, Math.round(distance / 70)) });
    }
    return json({ items: [...seen.values()].slice(0, 3) });
  } catch {
    return json({ items: [], note: "가까운 역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
}
