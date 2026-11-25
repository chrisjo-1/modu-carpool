import { ensureSchema, json } from "@/lib/server";
import { maybeRunAutoMail } from "@/lib/mailAuto";
import { alertDbDown } from "@/lib/dbAlert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 대량 메일 자동 이어 보내기 예약 실행(2026-11-13: 회원 접속이 없는 시간엔 /api/posts 의 after()가 안 불려 하루 몫이 안 나가던 문제).
 * Vercel 예약 실행이 1시간마다(한국 시간 9~19시 5분, 2026-11-25 DB 사용량 줄이기로 10분 → 1시간) 부른다. 실제 판단(시간대·10분 간격·반송 멈춤·하루 몫)은 maybeRunAutoMail 그대로.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "권한이 없어요." }, 401);
  try {
    await ensureSchema();
    await maybeRunAutoMail();
  } catch (e) {
    console.error("[cron mail-auto]", e);
    await alertDbDown(e, "예약 실행 mail-auto");
    return json({ error: "DB 오류" }, 500);
  }
  return json({ ok: true });
}
