import { json } from "@/lib/server";
import { seatDbReady } from "@/lib/seatDb";
import { runAlightAlerts } from "@/lib/seatAlight";

export const dynamic = "force-dynamic";

/** 하차 알림 확인(1분마다, Vercel 예약 실행). CRON_SECRET 필요. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "권한이 없어요." }, 401);
  if (!seatDbReady()) return json({ skipped: true });
  return json(await runAlightAlerts());
}
