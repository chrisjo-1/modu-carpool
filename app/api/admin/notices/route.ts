import { after } from "next/server";
import { GENDER_KEYS, KIND_LABEL, NOTICE_KINDS, ROLE_KEYS, cleanList, targetLabel, targetSummary, type NoticeKind } from "@/lib/notices";
import { pushEnabled, sendPush } from "@/lib/push";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 공지 목록, 또는 ?roles=&genders= 로 대상 인원 미리 보기 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const p = new URL(req.url).searchParams;
  try {
    await ensureSchema();
    const sql = db();
    if (p.has("preview")) {
      const roles = cleanList((p.get("roles") ?? "").split(",").filter(Boolean), ROLE_KEYS);
      const genders = cleanList((p.get("genders") ?? "").split(",").filter(Boolean), GENDER_KEYS);
      const t = await targetSummary(roles, genders);
      return json({ members: t.members, pushMembers: t.pushMembers, devices: t.devices, label: targetLabel(roles, genders), push: pushEnabled() });
    }
    const rows = await sql`select n.*, (select count(*)::int from notice_reads r where r.notice_id = n.id) as reads from notices n order by n.id desc limit 50`;
    return json({
      notices: rows.map((n) => ({ id: Number(n.id), kind: n.kind, kindLabel: KIND_LABEL[(n.kind as NoticeKind) ?? "notice"] ?? "공지만", title: n.title, body: n.body, label: targetLabel(n.roles as string[], n.genders as string[]), active: n.active, targets: n.target_count, pushSent: n.push_sent, reads: n.reads, at: new Date(n.created_at as string).getTime() })),
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * 공지 등록 {title, body, roles, genders, kind}
 * kind: notice(공지만: 앱을 열면 팝업 + 홈 공지 띠) · push(푸시 알림만) · both(둘 다)
 * 푸시는 응답을 먼저 돌려준 뒤 이어서 보낸다(대상이 많아도 화면이 멈추지 않게). 보낸 수는 목록에서 새로고침하면 보인다.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const title = text(b.title, 60);
  const msg = typeof b.body === "string" ? b.body.trim().slice(0, 1000) : "";
  if (title.length < 2 || msg.length < 2) return json({ error: "제목과 내용을 입력해 주세요." }, 400);
  const roles = cleanList(b.roles, ROLE_KEYS);
  const genders = cleanList(b.genders, GENDER_KEYS);
  // 예전 화면(push: true/false)도 받는다.
  const kind: NoticeKind = NOTICE_KINDS.find((k) => k === b.kind) ?? (b.push === true ? "both" : "notice");
  const wantPush = kind !== "notice";
  if (wantPush && !pushEnabled()) return json({ error: "푸시 알림 설정(VAPID 키)이 없어 푸시를 보낼 수 없습니다. '공지만'으로 보내 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const t = await targetSummary(roles, genders, wantPush);
    const row = await sql`insert into notices (title, body, roles, genders, target_count, kind) values (${title}, ${msg}, ${roles}::text[], ${genders}::text[], ${t.members}, ${kind}) returning id`;
    const id = Number(row[0].id);
    if (wantPush && t.pushIds.length) {
      const users = t.pushIds;
      after(async () => {
        let sent = 0;
        for (let i = 0; i < users.length; i += 50) {
          const n = await Promise.all(users.slice(i, i + 50).map((u) => sendPush(u, { title: `[공지] ${title}`, body: msg.slice(0, 120), url: `/?notice=${id}`, tag: `notice-${id}` })));
          sent += n.filter((x) => x > 0).length;
          // 중간에도 기록해 두어 목록에서 진행 상황이 보이게 한다.
          await db()`update notices set push_sent = ${sent} where id = ${id}`;
        }
      });
    }
    return json({ ok: true, id, kind, targets: t.members, pushQueued: wantPush ? t.pushMembers : 0 });
  } catch (e) {
    return fail(e);
  }
}

/** 공지 내리기·다시 올리기 {id, active} */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const id = Math.round(Number(b.id));
  if (!(id > 0)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`update notices set active = ${b.active === true} where id = ${id}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** 삭제 ?id= */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return denied();
  const id = Math.round(Number(new URL(req.url).searchParams.get("id")));
  if (!(id > 0)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from notices where id = ${id}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
