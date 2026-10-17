import { body, currentUserId, fail, json, needLogin, overLimit, recordAttempt } from "@/lib/server";
import { getCarConfirm, seatDbReady, submitCarNo } from "@/lib/seatDb";
import { isCarNo } from "@/lib/subwayPosition";

export const dynamic = "force-dynamic";

const DAILY_MAX = 20;
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const notReady = () => json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);

/** 매칭 상대와 같은 칸인지 확인 상태. 상대가 넣은 번호는 돌려주지 않는다. */
export async function GET(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return json({ error: "매칭을 찾을 수 없어요." }, 400);
  try {
    const r = await getCarConfirm(id, uid);
    return r.ok ? json({ mine: r.mine, result: r.result }) : json({ error: r.error }, 404);
  } catch (e) {
    return fail(e);
  }
}

/** 탑승 후 문 위 차량 번호(4자리)를 넣는다. 선택 기능이다. */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const b = await body(req);
  const carNo = typeof b.carNo === "string" ? b.carNo.trim() : "";
  if (!isId(b.id)) return json({ error: "매칭을 찾을 수 없어요." }, 400);
  if (!isCarNo(carNo)) return json({ error: "차량 번호 4자리를 넣어 주세요." }, 400);
  try {
    if (await overLimit("seatconfirm", uid, DAILY_MAX, 60 * 24)) {
      return json({ error: "오늘은 더 확인할 수 없어요." }, 429);
    }
    const r = await submitCarNo(b.id, uid, carNo);
    if (!r.ok) return json({ error: r.error }, 404);
    await recordAttempt("seatconfirm", uid);
    return json({ mine: r.mine, result: r.result });
  } catch (e) {
    return fail(e);
  }
}
