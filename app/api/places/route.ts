import { text } from "@/lib/server";
import { reversePlace, searchPlaces } from "@/lib/placeSearch";

export const dynamic = "force-dynamic";

/**
 * 장소 검색(?q=)과 좌표→주소 변환(?lat=&lng=).
 * KAKAO_REST_KEY 가 있으면 카카오 로컬 API를, 없으면 OpenStreetMap(Nominatim)을 쓴다.
 * 외부 API 키와 호출량을 서버에서 관리하려고 브라우저가 직접 부르지 않게 했다.
 */
const out = (data: unknown, cacheSeconds: number) =>
  Response.json(data, { headers: { "Cache-Control": cacheSeconds ? `public, s-maxage=${cacheSeconds}, max-age=300` : "no-store" } });

// 인스턴스 단위의 간단한 호출 제한(분당 40회). CDN 캐시와 함께 외부 API 남용을 줄인다.
const hits = new Map<string, { n: number; t: number }>();
function limited(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60_000) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > 40;
}

export async function GET(req: Request) {
  if (limited(req)) return Response.json({ items: [], name: "", error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  const p = new URL(req.url).searchParams;
  const q = text(p.get("q"), 60);
  const lang = ["ko", "en", "ja", "zh"].includes(p.get("lang") ?? "") ? (p.get("lang") as string) : "ko";
  try {
    if (q.length >= 2) {
      const items = await searchPlaces(q, lang);
      return out({ items }, 3600);
    }
    const lat = Number(p.get("lat"));
    const lng = Number(p.get("lng"));
    if (p.get("lat") && p.get("lng") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      // 카카오 키가 거절되면(권한 미설정 등) 무료 지도 검색으로 대신한다.
      const name = await reversePlace(lat, lng, lang);
      return out({ name }, 3600);
    }
    return out({ items: [], name: "" }, 0);
  } catch (e) {
    console.error("[places]", e);
    return out({ items: [], name: "", error: "장소 정보를 불러오지 못했습니다." }, 0);
  }
}
