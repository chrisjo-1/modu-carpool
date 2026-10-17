import { json, fail } from "@/lib/server";
import { seatDbReady } from "@/lib/seatDb";
import { loadFeedback } from "@/lib/seatCarDb";
import { parseKey, rankEntrances, type GuideResult } from "@/lib/seatCar";
import { lookupCongestion, type Congestion } from "@/lib/congestion";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=60, stale-while-revalidate=300";

export type CarGuideResponse = GuideResult & { congestion: Congestion | null };

/** 탑승 칸·입구 추천과 같은 역·시간대의 혼잡도. 로그인 없이 볼 수 있고, 같은 조건의 응답은 짧게 캐시한다. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = parseKey({
    line: u.searchParams.get("line"),
    station: u.searchParams.get("station"),
    dir: u.searchParams.get("dir"),
    dow: u.searchParams.get("dow"),
    slot: u.searchParams.get("slot"),
  });
  if (!q.ok) return json({ error: q.error }, 400);
  const { line, station, dir, dow, slot } = q.key;
  const congestion = lookupCongestion(line, station, dir, dow, slot);
  const empty: GuideResult = { status: "collecting", total: 0, ranked: [] };
  if (!seatDbReady()) return cached({ ...empty, congestion });
  try {
    return cached({ ...rankEntrances(await loadFeedback(q.key)), congestion });
  } catch (e) {
    return fail(e);
  }
}

function cached(data: CarGuideResponse) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
  });
}
