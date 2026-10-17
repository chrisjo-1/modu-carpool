import { currentUserId, body, fail, json, needLogin } from "@/lib/server";
import { createRequest, listRequests, respondRequest, seatDbReady } from "@/lib/seatDb";

export const dynamic = "force-dynamic";

const notReady = () => json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);

/** 받은 요청·보낸 요청 목록 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  try {
    return json(await listRequests(uid));
  } catch (e) {
    return fail(e);
  }
}

/** 후보 등록에 요청 보내기 */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const b = await body(req);
  const planId = Number(b.planId);
  if (!Number.isInteger(planId) || planId <= 0) return json({ error: "요청할 등록을 골라 주세요." }, 400);
  try {
    const r = await createRequest(uid, planId);
    return r.ok ? json({ id: r.id }) : json({ error: r.error }, 400);
  } catch (e) {
    return fail(e);
  }
}

/** 받은 요청 수락(accept: true) 또는 거절(false) */
export async function PUT(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const b = await body(req);
  const id = typeof b.id === "string" ? b.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "요청을 찾을 수 없어요." }, 400);
  try {
    const r = await respondRequest(id, uid, b.accept === true);
    return r.ok ? json({ status: r.status }) : json({ error: r.error }, 400);
  } catch (e) {
    return fail(e);
  }
}
