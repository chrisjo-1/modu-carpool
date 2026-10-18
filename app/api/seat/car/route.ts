import { json, fail } from "@/lib/server";
import { seatDbReady } from "@/lib/seatDb";
import { loadFeedback } from "@/lib/seatCarDb";
import { estimateCars, parseKey, rankEntrances, type Estimate, type GuideResult } from "@/lib/seatCar";
import { carCountOf } from "@/lib/subway";
import { lookupCongestion, type Congestion } from "@/lib/congestion";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=60, stale-while-revalidate=300";

export type CarGuideResponse = GuideResult & { congestion: Congestion | null; estimate: Estimate };

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
  const cars = carCountOf(line);
  // 기록이 모자라도 혼잡도·칸 위치로 바로 추정해 보여 준다(estimate).
  if (!seatDbReady()) return cached({ ...empty, congestion, estimate: estimateCars(cars, congestion?.pct ?? null, []) });
  try {
    const rows = await loadFeedback(q.key);
    return cached({ ...rankEntrances(rows), congestion, estimate: estimateCars(cars, congestion?.pct ?? null, rows) });
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
