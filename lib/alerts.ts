import { distanceKm } from "./geo";
import { pushText, sendPush } from "./push";
import { db } from "./server";

export const ALERT_KM = 2;
export const ALERT_MAX = 3;
const DAILY_CAP = 10;
const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

/**
 * 새 글(또는 내용이 바뀐 글)과 출발·도착이 각각 2km 안인 경로 알림을 찾아 푸시를 보낸다.
 * 글쓴이 본인, 서로 차단한 사이, 테스트 회원 글은 빼고, 경로마다 하루 10건까지.
 */
export async function notifyRouteAlerts(postId: string) {
  try {
    const sql = db();
    const p = await sql`select p.id, p.user_id, p.role, p.origin, p.dest, p.origin_lat, p.origin_lng, p.dest_lat, p.dest_lng, u.test
      from posts p join users u on u.id = p.user_id where p.id = ${postId} and p.status = 'open'`;
    const post = p[0];
    if (!post || post.test || post.origin_lat == null || post.dest_lat == null) return 0;
    const oLat = Number(post.origin_lat), oLng = Number(post.origin_lng), dLat = Number(post.dest_lat), dLng = Number(post.dest_lng);
    // 위도 0.02° ≈ 2.2km, 경도 0.03° ≈ 2.6km(서울 기준) 사각형으로 먼저 좁히고, 거리는 아래에서 정확히 잰다.
    const cand = await sql`select a.id, a.user_id, a.o_lat, a.o_lng, a.d_lat, a.d_lng, a.sent_day, a.sent_count
      from route_alerts a join users u on u.id = a.user_id
      where a.user_id <> ${post.user_id} and not u.blocked
        and (a.want = 'any' or a.want = ${post.role})
        and a.o_lat between ${oLat - 0.02} and ${oLat + 0.02} and a.o_lng between ${oLng - 0.03} and ${oLng + 0.03}
        and a.d_lat between ${dLat - 0.02} and ${dLat + 0.02} and a.d_lng between ${dLng - 0.03} and ${dLng + 0.03}
        and not exists (select 1 from blocks b where (b.blocker = a.user_id and b.blocked = ${post.user_id}) or (b.blocker = ${post.user_id} and b.blocked = a.user_id))`;
    const today = kstDay();
    const seen = new Set<string>();
    let sent = 0;
    for (const a of cand) {
      const uid = String(a.user_id);
      if (seen.has(uid)) continue;
      if (distanceKm(oLat, oLng, Number(a.o_lat), Number(a.o_lng)) > ALERT_KM || distanceKm(dLat, dLng, Number(a.d_lat), Number(a.d_lng)) > ALERT_KM) continue;
      const count = a.sent_day === today ? Number(a.sent_count) : 0;
      if (count >= DAILY_CAP) continue;
      seen.add(uid);
      await sql`update route_alerts set sent_day = ${today}, sent_count = ${count + 1} where id = ${a.id}`;
      const who = post.role === "rider" ? "탑승자" : "운전자";
      sent += await sendPush(uid, {
        title: `내 경로에 새 ${who} 글이 올라왔어요`,
        body: pushText.cut(`${post.origin} → ${post.dest}`, 80),
        url: `/?p=${post.id}`,
        tag: `alert-${post.id}`,
      });
    }
    if (seen.size) console.log(`[alerts] post ${postId}: ${seen.size} matched, ${sent} pushed`);
    return sent;
  } catch (e) {
    console.error("[alerts]", e);
    return 0;
  }
}
