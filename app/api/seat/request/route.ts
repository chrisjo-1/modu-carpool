import { currentUserId, body, db, fail, json, needLogin } from "@/lib/server";
import { createRequest, getSpot, listRequests, respondRequest, seatDbReady, type RequestView } from "@/lib/seatDb";
import { seatPush } from "@/lib/seatNotify";

export const dynamic = "force-dynamic";

const notReady = () => json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);

/**
 * 받은 요청·보낸 요청 목록.
 * 수락 전에는 하차역·자리 위치를 숨기고, 수락 후에만 하차역·자리 위치·등록한 연락처(SNS)를 보여 준다.
 * 상대 회원 번호는 보내지 않는다.
 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  try {
    const { incoming, outgoing } = await listRequests(uid);
    const all = [...incoming, ...outgoing];
    const acceptedUsers = [...new Set(all.filter((v) => v.status === "accepted").map((v) => v.otherUser))];
    const contacts = new Map<string, { type: string; id: string }>();
    if (acceptedUsers.length) {
      const rows = await db()`select id, contact_type, contact from users where id = any(${acceptedUsers}::uuid[])`;
      for (const r of rows) contacts.set(String(r.id), { type: String(r.contact_type), id: String(r.contact) });
    }
    const show = async (v: RequestView) => {
      const { otherUser, ...rest } = v;
      if (v.status !== "accepted" || !v.pair) {
        return { ...rest, pair: v.pair ? { ...v.pair, seatStation: "", car: "", gate: "" } : null, spot: null, contact: null };
      }
      // 자리 위치는 양보하는 사람의 오늘 자리. 내가 받는 쪽이면 상대 자리, 주는 쪽이면 내 자리.
      const giver = v.pair.role === "take" ? otherUser : uid;
      const c = contacts.get(otherUser);
      return { ...rest, spot: await getSpot(giver), contact: c && c.id ? c : null };
    };
    return json({ incoming: await Promise.all(incoming.map(show)), outgoing: await Promise.all(outgoing.map(show)) });
  } catch (e) {
    return fail(e);
  }
}

/** 후보 등록에 요청 보내기(횟수 제한 없음). 상대에게 푸시로 알린다. */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const b = await body(req);
  const planId = Number(b.planId);
  if (!Number.isInteger(planId) || planId <= 0) return json({ error: "요청할 등록을 골라 주세요." }, 400);
  try {
    // mode: 목록(ahead: 내 뒤에 타는 분, before: 내 하차 전에 자리를 비우는 분)에서 고른 경우
    const mode = b.mode === "ahead" || b.mode === "before" ? b.mode : "auto";
    // trip: 내 방향 여정, theirTrip: 상대가 맞은 방향 여정(목록에서 받은 값)
    const myTrip = b.trip === "back" ? "back" : "go";
    const theirTrip = b.theirTrip === "back" ? "back" : "go";
    const r = await createRequest(uid, planId, "manual", mode, myTrip, theirTrip);
    if (!r.ok) return json({ error: r.error }, 400);
    await seatPush(r.toUser, "자리 나눔 요청이 왔어요", "지하철 메뉴에서 확인하고 수락해 주세요.", "seat-req");
    return json({ id: r.id });
  } catch (e) {
    return fail(e);
  }
}

/** 받은 요청 수락(accept: true) 또는 거절(false). 수락하면 요청한 사람에게 알린다. */
export async function PUT(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const b = await body(req);
  const id = typeof b.id === "string" ? b.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "요청을 찾을 수 없어요." }, 400);
  try {
    const r = await respondRequest(id, uid, b.accept === true);
    if (!r.ok) return json({ error: r.error }, 400);
    if (r.status === "accepted") await seatPush(r.fromUser, "자리 나눔이 수락됐어요", "하차역과 자리 위치를 확인하고 대화해 보세요.", `seat-acc-${id}`);
    return json({ status: r.status });
  } catch (e) {
    return fail(e);
  }
}
