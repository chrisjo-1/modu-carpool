import { body, currentUserId, fail, json, needLogin, overLimit, recordAttempt } from "@/lib/server";
import { seatDbReady } from "@/lib/seatDb";
import { insertFeedback } from "@/lib/seatCarDb";
import { parseFeedback } from "@/lib/seatCar";

export const dynamic = "force-dynamic";

const DAILY_MAX = 30;

/** 착석 결과 한 건 저장. 로그인은 남용 방지용이며, 저장되는 기록에는 회원 번호가 없다. */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  const b = await body(req);
  const f = parseFeedback(b);
  if (!f.ok) return json({ error: f.error }, 400);
  try {
    if (await overLimit("seatcar", uid, DAILY_MAX, 60 * 24)) {
      return json({ error: "오늘은 더 남기실 수 없어요. 내일 다시 알려 주세요." }, 429);
    }
    await insertFeedback(f.key, f.car, f.entrance, f.seated);
    await recordAttempt("seatcar", uid);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
