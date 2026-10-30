import { after } from "next/server";
import { cleanTerms, type ContractTerms } from "@/lib/contract";
import { pushText, sendPush } from "@/lib/push";
import { body, clientIp, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 정기카풀 계약서(2026-10-30). 정기카풀 글의 수락된 신청(대화방)마다 판(version)을 쌓는다.
 * - GET ?req=신청ID: 그 대화의 계약서 판 목록(최신 먼저)과 운전자·탑승자 정보
 * - GET ?mine=1: 내가 당사자인 최신 계약서 목록
 * - POST {action:"propose", requestId, terms}: 새 판을 보낸다(보낸 사람은 동의한 것으로 본다). 이전 '동의 대기' 판은 '이전 판'.
 * - POST {action:"sign", id}: 상대가 동의 → 둘 다 동의하면 '체결', 그 전 체결 판은 '이전 판'
 * - POST {action:"end", id}: 체결된 계약 해지
 * 보내기·동의·해지 때 대화방에 안내 메시지를 넣고 상대에게 푸시한다. 서명은 앱 동의(시각·접속처 기록).
 */
type Row = Record<string, unknown>;

async function party(requestId: string, me: string) {
  const r = await db()`
    select r.id, r.status, r.user_id as applicant, p.user_id as owner, p.role, p.regular, p.origin, p.dest, p.days, p.time_go, p.time_back, p.price,
      ua.name as a_name, ua.member_code as a_code, uo.name as o_name, uo.member_code as o_code, uo.car_no as o_car, ua.car_no as a_car
    from requests r join posts p on p.id = r.post_id join users ua on ua.id = r.user_id join users uo on uo.id = p.user_id
    where r.id = ${requestId} and (r.user_id = ${me} or p.user_id = ${me})`;
  if (!r.length) return null;
  const x = r[0];
  // 글이 운전자 글이면 글쓴이가 운전자, 탑승자 글이면 신청자가 운전자
  const ownerDrives = String(x.role) === "driver";
  return {
    accepted: String(x.status) === "accepted",
    regular: x.regular === true,
    driverId: String(ownerDrives ? x.owner : x.applicant),
    riderId: String(ownerDrives ? x.applicant : x.owner),
    driver: { name: String((ownerDrives ? x.o_name : x.a_name) ?? ""), code: String((ownerDrives ? x.o_code : x.a_code) ?? ""), carNo: String((ownerDrives ? x.o_car : x.a_car) ?? "") },
    rider: { name: String((ownerDrives ? x.a_name : x.o_name) ?? ""), code: String((ownerDrives ? x.a_code : x.o_code) ?? "") },
    post: { origin: String(x.origin), dest: String(x.dest), days: String(x.days ?? ""), timeGo: String(x.time_go ?? ""), timeBack: String(x.time_back ?? ""), price: Number(x.price) || 0 },
  };
}

const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
const shape = (c: Row) => ({
  id: String(c.id),
  version: Number(c.version),
  status: String(c.status),
  proposedBy: String(c.proposed_by),
  terms: c.terms as ContractTerms,
  driverSignedAt: ms(c.driver_signed_at),
  riderSignedAt: ms(c.rider_signed_at),
  endedAt: ms(c.ended_at),
  createdAt: ms(c.created_at) as number,
});

/** 대화방에 안내 메시지를 넣고 상대에게 푸시 */
async function announce(requestId: string, me: string, other: string, text: string) {
  const sql = db();
  const m = await sql`insert into messages (request_id, user_id, body) values (${requestId}, ${me}, ${text}) returning id`;
  await sql`insert into chat_reads (request_id, user_id, last_id) values (${requestId}, ${me}, ${m[0].id})
            on conflict (request_id, user_id) do update set last_id = greatest(chat_reads.last_id, excluded.last_id)`;
  const n = await sql`select name from users where id = ${me}`;
  after(() => sendPush(other, { title: `${String(n[0]?.name ?? "회원")} · 정기카풀 계약서`.slice(0, 60), body: pushText.cut(text, 120), url: `/?room=${requestId}`, tag: `chat-${requestId}` }).catch(() => {}));
}

export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const sql = db();
    if (sp.get("mine")) {
      const rows = await sql`
        select distinct on (c.request_id) c.*, (c.driver_id = ${me}) as i_drive,
          (select name from users where id = case when c.driver_id = ${me} then c.rider_id else c.driver_id end) as other_name
        from contracts c where c.driver_id = ${me} or c.rider_id = ${me}
        order by c.request_id, c.version desc`;
      const list = rows
        .map((c) => ({ ...shape(c), requestId: String(c.request_id), iDrive: c.i_drive === true, other: String(c.other_name ?? "") }))
        .sort((a, b) => b.createdAt - a.createdAt);
      return json({ contracts: list });
    }
    const requestId = sp.get("req") ?? "";
    if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
    const p = await party(requestId, me);
    if (!p) return json({ error: "권한이 없습니다." }, 403);
    const rows = await sql`select * from contracts where request_id = ${requestId} order by version desc limit 20`;
    return json({ me, driverId: p.driverId, riderId: p.riderId, driver: p.driver, rider: p.rider, post: p.post, canWrite: p.accepted && p.regular, contracts: rows.map(shape) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();
    const ip = clientIp(req);

    if (b.action === "propose") {
      const requestId = typeof b.requestId === "string" ? b.requestId : "";
      if (!isUuid(requestId)) return json({ error: "잘못된 요청입니다." }, 400);
      const p = await party(requestId, me);
      if (!p) return json({ error: "권한이 없습니다." }, 403);
      if (!p.accepted || !p.regular) return json({ error: "정기카풀 신청이 수락된 대화에서만 계약서를 쓸 수 있어요." }, 400);
      const { terms, error } = cleanTerms(b.terms);
      if (!terms) return json({ error }, 400);
      const iDrive = me === p.driverId;
      await sql`update contracts set status = 'superseded' where request_id = ${requestId} and status = 'proposed'`;
      const v = await sql`select coalesce(max(version), 0) + 1 as v from contracts where request_id = ${requestId}`;
      const version = Number(v[0].v);
      await sql`insert into contracts (request_id, version, status, driver_id, rider_id, proposed_by, terms, driver_signed_at, rider_signed_at, driver_ip, rider_ip)
        values (${requestId}, ${version}, 'proposed', ${p.driverId}, ${p.riderId}, ${me}, ${JSON.stringify(terms)}::jsonb,
          ${iDrive ? new Date().toISOString() : null}, ${iDrive ? null : new Date().toISOString()}, ${iDrive ? ip : ""}, ${iDrive ? "" : ip})`;
      await announce(requestId, me, iDrive ? p.riderId : p.driverId, `📄 정기카풀 계약서 ${version}판을 보냈어요. 위쪽 [정기카풀 계약서]에서 내용을 확인하고 동의해 주세요.`);
      return json({ ok: true, version });
    }

    const id = typeof b.id === "string" ? b.id : "";
    if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
    const c = await sql`select * from contracts where id = ${id} and (driver_id = ${me} or rider_id = ${me})`;
    if (!c.length) return json({ error: "계약서를 찾을 수 없습니다." }, 404);
    const row = c[0];
    const iDrive = String(row.driver_id) === me;
    const other = iDrive ? String(row.rider_id) : String(row.driver_id);
    const requestId = String(row.request_id);

    if (b.action === "sign") {
      if (row.status !== "proposed") return json({ error: "이미 처리된 계약서예요." }, 400);
      const upd = iDrive
        ? await sql`update contracts set driver_signed_at = now(), driver_ip = ${ip} where id = ${id} and driver_signed_at is null returning rider_signed_at`
        : await sql`update contracts set rider_signed_at = now(), rider_ip = ${ip} where id = ${id} and rider_signed_at is null returning driver_signed_at`;
      if (!upd.length) return json({ error: "이미 동의했어요." }, 400);
      await sql`update contracts set status = 'superseded' where request_id = ${requestId} and status = 'signed' and id <> ${id}`;
      await sql`update contracts set status = 'signed' where id = ${id} and driver_signed_at is not null and rider_signed_at is not null`;
      await announce(requestId, me, other, `✅ 정기카풀 계약서 ${row.version}판에 동의했어요. 계약이 체결됐어요.`);
      return json({ ok: true });
    }

    if (b.action === "end") {
      if (row.status !== "signed" && row.status !== "proposed") return json({ error: "해지할 수 있는 계약서가 아니에요." }, 400);
      const was = String(row.status);
      await sql`update contracts set status = ${was === "signed" ? "ended" : "cancelled"}, ended_by = ${me}, ended_at = now() where id = ${id}`;
      await announce(requestId, me, other, was === "signed" ? `⛔ 정기카풀 계약서 ${row.version}판을 해지했어요. 계약서의 중도 해지 약속을 확인해 주세요.` : `정기카풀 계약서 ${row.version}판 제안을 취소했어요.`);
      return json({ ok: true });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}
