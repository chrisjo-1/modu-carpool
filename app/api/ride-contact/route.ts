import { logOps } from "@/lib/opsLog";
import { normPhone } from "@/lib/safety";
import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 대화방 한 건에서 나의 역할과 탑승자 성별. 대화방 당사자가 아니면 null. */
async function ctx(requestId: string, me: string) {
  const r = await db()`select r.status, r.user_id as applicant, p.user_id as owner, p.role
    from requests r join posts p on p.id = r.post_id where r.id = ${requestId}`;
  if (!r.length) return null;
  const x = r[0];
  const ownerDrives = String(x.role) === "driver";
  const driverId = String(ownerDrives ? x.owner : x.applicant);
  const riderId = String(ownerDrives ? x.applicant : x.owner);
  if (me !== driverId && me !== riderId) return null;
  const g = await db()`select gender from users where id = ${riderId}`;
  return {
    accepted: String(x.status) === "accepted",
    isDriver: me === driverId,
    riderFemale: String(g[0]?.gender ?? "") === "female",
  };
}

/** GET ?req= : 운전자에게만 필요(탑승자가 여성인 수락된 카풀). 번호는 돌려주지 않는다. */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const requestId = new URL(req.url).searchParams.get("req") ?? "";
  if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const c = await ctx(requestId, me);
    if (!c) return json({ error: "대화방을 찾을 수 없어요." }, 404);
    const needed = c.accepted && c.isDriver && c.riderFemale;
    const reg = needed ? await db()`select 1 from ride_contacts where request_id = ${requestId}` : [];
    return json({ needed, registered: reg.length > 0 });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST
 * - register {requestId, phone, agree}: 운전자가 연락처 등록(동의 필요). 같은 대화는 번호를 바꿀 수 있다.
 * - end {requestId}: 운전자가 카풀을 마치고 번호를 삭제.
 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const requestId = String(b.requestId ?? "");
  if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const c = await ctx(requestId, me);
    if (!c) return json({ error: "대화방을 찾을 수 없어요." }, 404);
    if (!c.isDriver) return json({ error: "운전자만 할 수 있어요." }, 403);

    if (b.action === "register") {
      if (!c.accepted || !c.riderFemale) return json({ error: "이 카풀에서는 연락처를 받지 않아요." }, 400);
      if (b.agree !== true) return json({ error: "안내를 확인하고 동의해 주세요." }, 400);
      const phone = normPhone(b.phone);
      if (!phone) return json({ error: "전화번호를 정확히 입력해 주세요." }, 400);
      await db()`insert into ride_contacts (request_id, phone) values (${requestId}, ${phone})
        on conflict (request_id) do update set phone = excluded.phone, created_at = now()`;
      await logOps("admin", "운전자 연락처 동의", `요청 ${requestId.slice(0, 8)} · 번호는 기록하지 않음`, "운전자");
      return json({ ok: true });
    }

    if (b.action === "end") {
      await db()`delete from ride_contacts where request_id = ${requestId}`;
      return json({ ok: true });
    }

    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}
