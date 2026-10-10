import { distanceKm } from "./geo";
import { pushText, sendPush } from "./push";
import { db } from "./server";
import { boundingBox, getRadius } from "./radius";

const MAX_RECIPIENTS = 200;

/**
 * 택시 동승 글이 올라오면 출발지 반경 안의 회원에게 푸시한다.
 * 회원의 위치는 가장 최근 카풀 글의 출발지로 본다(위치를 따로 저장하지 않는다).
 * 글쓴이, 서로 차단한 사이, 테스트 회원, 알림을 끈 회원은 뺀다. 한 번에 최대 200명.
 */
export async function notifyTaxi(postId: string): Promise<number> {
  try {
    const sql = db();
    const p = (await sql`select id, user_id, origin, dest, origin_lat, origin_lng, depart_at from posts where id = ${postId} and service = 'taxi'`)[0];
    if (!p || p.origin_lat == null || p.origin_lng == null) return 0;
    const lat = Number(p.origin_lat), lng = Number(p.origin_lng);
    const km = await getRadius("taxi");
    const b = boundingBox(lat, lng, km);
    // 회원별 가장 최근 카풀 출발지를 먼저 고르고, 그 좌표가 반경 안인지 본다.
    const cand = await sql`select h.user_id, h.origin_lat, h.origin_lng from (
        select distinct on (p2.user_id) p2.user_id, p2.origin_lat, p2.origin_lng
        from posts p2 join users u on u.id = p2.user_id
        where p2.service = 'carpool' and p2.origin_lat is not null and not u.blocked and not u.test and u.notify
        order by p2.user_id, p2.created_at desc) h
      where h.user_id <> ${p.user_id}
        and h.origin_lat between ${b.minLat} and ${b.maxLat} and h.origin_lng between ${b.minLng} and ${b.maxLng}
        and not exists (select 1 from blocks k where (k.blocker = h.user_id and k.blocked = ${p.user_id}) or (k.blocker = ${p.user_id} and k.blocked = h.user_id))
      limit 1000`;
    const ids = cand
      .filter((c) => distanceKm(lat, lng, Number(c.origin_lat), Number(c.origin_lng)) <= km)
      .map((c) => String(c.user_id))
      .slice(0, MAX_RECIPIENTS);
    if (!ids.length) return 0;
    const when = new Date(p.depart_at as string).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
    let sent = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const part = await Promise.all(
        ids.slice(i, i + 50).map((uid) =>
          sendPush(uid, {
            title: `근처에서 택시 동승을 찾아요 (${km}km 안)`,
            body: pushText.cut(`${p.origin} → ${p.dest} · ${when}`, 80),
            url: `/?p=${p.id}`,
            tag: `taxi-${p.id}`,
          })
        )
      );
      sent += part.reduce((a, b) => a + b, 0);
    }
    console.log(`[taxi] post ${postId}: ${ids.length} in ${km}km, ${sent} pushed`);
    return sent;
  } catch (e) {
    console.error("[taxi]", e);
    return 0;
  }
}
