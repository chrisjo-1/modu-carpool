import webpush from "web-push";
import { db } from "./server";
import { PUSH_PAUSE_ALLOWED } from "./pushPolicy";

/** VAPID 키가 있어야 푸시를 보낼 수 있다. */
export const pushEnabled = () => !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@moducarpool.com", process.env.VAPID_PUBLIC_KEY as string, process.env.VAPID_PRIVATE_KEY as string);
  ready = true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** 회원의 모든 기기로 푸시를 보낸다. 만료된 구독은 지운다. 실패해도 본래 동작은 계속된다. */
export async function sendPush(userId: string, payload: PushPayload) {
  // 앱 안 알림함에 먼저 남긴다(기기가 받지 못해도 놓친 알림을 볼 수 있게). 같은 tag의 안 읽은 알림은 새 내용으로 바꾼다.
  await saveAlert(userId, payload).catch(() => {});
  if (!pushEnabled()) return 0;
  try {
    setup();
    const sql = db();
    // 멈춘 기기라도 회원이 10일 넘게 접속하지 않았으면 멈춤을 풀고 다시 보낸다.
    // 끄기를 막아 둔 동안은 멈춰 둔 기기도 바로 다시 켠다(lib/pushPolicy.ts)
    if (!PUSH_PAUSE_ALLOWED) await sql`update push_subs set paused_at = null where user_id = ${userId} and paused_at is not null`;
    await sql`update push_subs s set paused_at = null from users u
              where s.user_id = ${userId} and u.id = s.user_id and s.paused_at is not null
                and s.paused_at < now() - interval '10 days' and (u.last_seen is null or u.last_seen < now() - interval '10 days')`;
    const subs = await sql`select s.endpoint, s.p256dh, s.auth from push_subs s join users u on u.id = s.user_id where s.user_id = ${userId} and not u.blocked and s.paused_at is null`;
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, JSON.stringify(payload), { TTL: 60 * 60 * 6, urgency: "high" });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sql`delete from push_subs where endpoint = ${s.endpoint}`;
          else console.error("[push]", code, (e as Error).message);
        }
      })
    );
    return sent;
  } catch (e) {
    console.error("[push]", e);
    return 0;
  }
}

async function saveAlert(userId: string, p: PushPayload) {
  const sql = db();
  const url = typeof p.url === "string" && p.url.startsWith("/") ? p.url.slice(0, 300) : "/";
  const tag = String(p.tag ?? "").slice(0, 120);
  if (tag) {
    const up = await sql`update user_alerts set title = ${p.title.slice(0, 120)}, body = ${String(p.body ?? "").slice(0, 300)}, url = ${url}, created_at = now()
      where user_id = ${userId} and tag = ${tag} and read_at is null returning id`;
    if (up.length) return;
  }
  await sql`insert into user_alerts (user_id, title, body, url, tag) values (${userId}, ${p.title.slice(0, 120)}, ${String(p.body ?? "").slice(0, 300)}, ${url}, ${tag})`;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
export const pushText = { cut };
