import { db, ensureSchema, json } from "@/lib/server";
import { runRepostReminders } from "@/lib/repostRemind";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 매일 저녁 8시(한국 시간) 다시 올리기 하루 전 알림. Vercel 예약 실행이 부른다(CRON_SECRET 필요).
 * 보조로 /api/posts 가 저녁 8시 이후 첫 요청 때 한 번 돌리므로, 같은 날 두 번 보내지 않게 날짜를 기록한다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "권한이 없어요." }, 401);
  await ensureSchema();
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  await db()`insert into settings (key, value) values ('repost_remind_day', ${day}) on conflict (key) do update set value = excluded.value`;
  return json(await runRepostReminders(1000));
}
