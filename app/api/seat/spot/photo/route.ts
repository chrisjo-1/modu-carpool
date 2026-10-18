import { currentUserId, needLogin } from "@/lib/server";
import { getSpotPhoto, matchPartner, seatDbReady } from "@/lib/seatDb";

export const dynamic = "force-dynamic";

/**
 * 오늘의 힌트 사진. ?req=매칭ID → 수락된 매칭의 상대 사진, 없으면 내 사진.
 * 수락된 당사자만 볼 수 있다. 캐시하지 않는다.
 */
export async function GET(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return new Response(null, { status: 404 });
  const reqId = new URL(req.url).searchParams.get("req");
  let owner = uid;
  if (reqId) {
    if (!/^[0-9a-f-]{36}$/i.test(reqId)) return new Response(null, { status: 400 });
    const partner = await matchPartner(reqId, uid);
    if (!partner) return new Response(null, { status: 403 });
    owner = partner;
  }
  const b64 = await getSpotPhoto(owner);
  if (!b64) return new Response(null, { status: 404 });
  return new Response(Buffer.from(b64, "base64"), { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" } });
}
