import { pushEnabled } from "@/lib/push";
import { body, currentUserId, db, ensureSchema, fail, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 공개키와 이 기기 구독 여부 */
export async function GET(req: Request) {
  const enabled = pushEnabled();
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  let subscribed = false;
  const me = await currentUserId();
  if (enabled && me && endpoint) {
    try {
      await ensureSchema();
      subscribed = (await db()`select 1 from push_subs where endpoint = ${endpoint} and user_id = ${me}`).length > 0;
    } catch {
      /* 무시 */
    }
  }
  return json({ enabled, key: enabled ? process.env.VAPID_PUBLIC_KEY : "", subscribed });
}

/** 이 기기 구독 저장 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  if (!pushEnabled()) return json({ error: "푸시 알림을 준비 중입니다." }, 503);
  const b = await body(req);
  const s = b.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "";
  const auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
  if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint) || !/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,100}$/.test(auth))
    return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const n = await sql`select count(*)::int as n from push_subs where user_id = ${me}`;
    if ((n[0].n as number) >= 10) await sql`delete from push_subs where endpoint in (select endpoint from push_subs where user_id = ${me} order by created_at limit 1)`;
    await sql`insert into push_subs (endpoint, user_id, p256dh, auth) values (${endpoint}, ${me}, ${p256dh}, ${auth})
              on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 이 기기 구독 해제 */
export async function DELETE(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const endpoint = new URL(req.url).searchParams.get("endpoint") ?? "";
  try {
    await ensureSchema();
    await db()`delete from push_subs where endpoint = ${endpoint} and user_id = ${me}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
