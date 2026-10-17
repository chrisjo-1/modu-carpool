import { body, currentUserId, db, fail, json, needLogin, text } from "@/lib/server";
import { addSeatMessage, listSeatMessages, matchPartner, seatDbReady } from "@/lib/seatDb";
import { seatPush } from "@/lib/seatNotify";
import { pushText } from "@/lib/push";

export const dynamic = "force-dynamic";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const notReady = () => json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);

/** 수락된 지하철 매칭의 대화 목록 */
export async function GET(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return json({ error: "매칭을 찾을 수 없어요." }, 400);
  try {
    if (!(await matchPartner(id, uid))) return json({ error: "수락된 뒤에 대화할 수 있어요." }, 403);
    return json({ messages: await listSeatMessages(id, uid) });
  } catch (e) {
    return fail(e);
  }
}

/** 대화 보내기. 상대에게 푸시로 알린다. */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const b = await body(req);
  const msg = text(b.body, 300);
  if (!isId(b.id)) return json({ error: "매칭을 찾을 수 없어요." }, 400);
  if (!msg) return json({ error: "내용을 적어 주세요." }, 400);
  try {
    const other = await matchPartner(b.id, uid);
    if (!other) return json({ error: "수락된 뒤에 대화할 수 있어요." }, 403);
    // 서로 차단한 사이면 보내지 않는다.
    const blocked = await db()`select 1 from blocks where (blocker = ${uid} and blocked = ${other}) or (blocker = ${other} and blocked = ${uid}) limit 1`;
    if (blocked.length) return json({ error: "대화할 수 없는 상대예요." }, 403);
    await addSeatMessage(b.id, uid, msg);
    await seatPush(other, "지하철 대화", pushText.cut(msg, 120), `seat-chat-${b.id}`);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
