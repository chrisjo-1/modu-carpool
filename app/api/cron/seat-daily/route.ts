import { json } from "@/lib/server";
import { activePlans, seatDbReady } from "@/lib/seatDb";
import { rankCandidates } from "@/lib/seatMatch";
import { seatPush } from "@/lib/seatNotify";

export const dynamic = "force-dynamic";

/**
 * 매일 아침(한국 시각 6시 30분 무렵) 오늘 자리를 나눌 수 있는 상대가 있는 회원에게 알린다.
 * Vercel 예약 실행이 부른다. 환경변수 CRON_SECRET이 있어야 하고, 요청 헤더가 그 값과 맞아야 한다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "권한이 없어요." }, 401);
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  const dow = String(new Date(Date.now() + 9 * 3600_000).getUTCDay());
  const plans = (await activePlans()).filter((p) => p.days.includes(dow));
  let notified = 0;
  for (const me of plans) {
    const n = new Set(rankCandidates(me, plans).map((c) => c.userId)).size;
    if (!n) continue;
    await seatPush(me.userId, "오늘 자리를 나눌 수 있는 분이 있어요", `${n}명과 1~3정거장 안에서 자리를 나눌 수 있어요. 지하철 메뉴에서 CALL을 눌러 보세요.`, "seat-daily");
    notified++;
  }
  return json({ plans: plans.length, notified });
}
