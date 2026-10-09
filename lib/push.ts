import webpush from "web-push";
import { db } from "./server";

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
  if (!pushEnabled()) return 0;
  try {
    setup();
    const sql = db();
    const subs = await sql`select s.endpoint, s.p256dh, s.auth from push_subs s join users u on u.id = s.user_id where s.user_id = ${userId} and not u.blocked`;
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

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
export const pushText = { cut };
