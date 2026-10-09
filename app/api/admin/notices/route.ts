import { GENDER_KEYS, ROLE_KEYS, cleanList, targetLabel, targetUsers } from "@/lib/notices";
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
      const ids = await targetUsers(roles, genders);
      const devices = ids.length ? await sql`select count(*)::int as n, count(distinct user_id)::int as u from push_subs where user_id = any(${ids}::uuid[])` : [{ n: 0, u: 0 }];
      return json({ members: ids.length, pushMembers: devices[0].u, devices: devices[0].n, label: targetLabel(roles, genders), push: pushEnabled() });
    }
    const rows = await sql`select n.*, (select count(*)::int from notice_reads r where r.notice_id = n.id) as reads from notices n order by n.id desc limit 50`;
    return json({
      notices: rows.map((n) => ({ id: Number(n.id), title: n.title, body: n.body, label: targetLabel(n.roles as string[], n.genders as string[]), active: n.active, targets: n.target_count, pushSent: n.push_sent, reads: n.reads, at: new Date(n.created_at as string).getTime() })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** 공지 등록 {title, body, roles, genders, push} → 대상에게 팝업, push 면 푸시도 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const title = text(b.title, 60);
  const msg = typeof b.body === "string" ? b.body.trim().slice(0, 1000) : "";
  if (title.length < 2 || msg.length < 2) return json({ error: "제목과 내용을 입력해 주세요." }, 400);
  const roles = cleanList(b.roles, ROLE_KEYS);
  const genders = cleanList(b.genders, GENDER_KEYS);
  try {
    await ensureSchema();
    const sql = db();
    const ids = await targetUsers(roles, genders);
    const row = await sql`insert into notices (title, body, roles, genders, target_count) values (${title}, ${msg}, ${roles}::text[], ${genders}::text[], ${ids.length}) returning id`;
    const id = Number(row[0].id);
    let sent = 0;
    if (b.push !== false && pushEnabled()) {
      const subs = ids.length ? await sql`select distinct user_id from push_subs where user_id = any(${ids}::uuid[])` : [];
      const users = subs.map((s) => String(s.user_id));
      for (let i = 0; i < users.length; i += 50) {
        const n = await Promise.all(users.slice(i, i + 50).map((u) => sendPush(u, { title: `[공지] ${title}`, body: msg.slice(0, 120), url: `/?notice=${id}`, tag: `notice-${id}` })));
        sent += n.filter((x) => x > 0).length;
      }
      await sql`update notices set push_sent = ${sent} where id = ${id}`;
    }
    return json({ ok: true, id, targets: ids.length, pushSent: sent });
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
