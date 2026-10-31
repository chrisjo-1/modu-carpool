import { deliver } from "@/lib/mail";
import { sendPush } from "@/lib/push";
import { body, db, ensureSchema, fail, isAdmin, isUuid, json, text } from "@/lib/server";
import { suppressedNow } from "@/lib/unsub";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * 관리자 → 회원 한 명에게만 푸시·메일(2026-10-31 사용자 지시).
 * POST {userId | warpId, channel: push|mail|both, title, body}
 * - userId: 모두의카풀 회원(푸시·메일). warpId: 워프 고유번호 — 계정이 이어져 있으면 그 회원, 아니면 워프 명단 메일로만.
 * - 탈퇴·정지 회원, 수신거부·탈퇴 메일 주소는 보내지 않는다. 기록은 admin_notify_log(내용은 제목만).
 * GET ?target= : 그 대상에게 보낸 최근 기록
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const t = text(new URL(req.url).searchParams.get("target"), 60);
    const rows = t
      ? await db()`select channel, title, result, at from admin_notify_log where target = ${t} order by at desc limit 20`
      : await db()`select target, channel, title, result, at from admin_notify_log order by at desc limit 50`;
    return json({ log: rows.map((r) => ({ target: String(r.target ?? t), channel: String(r.channel), title: String(r.title), result: String(r.result), at: new Date(r.at as string).getTime() })) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const sql = db();
    const b = await body(req);
    const channel = b.channel === "push" || b.channel === "mail" ? b.channel : "both";
    const title = text(b.title, 60);
    const msg = text(b.body, 1000);
    if (!title || !msg) return json({ error: "제목과 내용을 적어 주세요." }, 400);
    let userId = isUuid(b.userId) ? b.userId : null;
    const warpId = text(b.warpId, 12).toUpperCase();
    let email = "";
    if (!userId && warpId) {
      const l = await sql`select matched_user, email, withdrawn from legacy_members where upper(warp_id) = ${warpId} limit 1`;
      if (!l.length) return json({ error: "워프 명단에 없는 고유번호예요." }, 404);
      if (l[0].withdrawn) return json({ error: "워프에서 탈퇴한 회원이라 보낼 수 없어요." }, 400);
      if (l[0].matched_user) userId = String(l[0].matched_user);
      else email = String(l[0].email ?? "");
    }
    if (!userId && !email) return json({ error: "보낼 대상을 찾지 못했어요." }, 400);
    if (userId) {
      const u = await sql`select email, blocked, withdrawn_at from users where id = ${userId}`;
      if (!u.length || u[0].withdrawn_at) return json({ error: "탈퇴한 회원이에요." }, 400);
      if (u[0].blocked) return json({ error: "이용 정지된 회원이에요." }, 400);
      email = String(u[0].email ?? "");
    }
    const target = userId ?? `warp:${warpId}`;
    const result: string[] = [];
    if (channel !== "mail") {
      if (!userId) result.push("푸시: 앱 계정 없음");
      else {
        const n = await sendPush(userId, { title, body: msg.slice(0, 180), url: "/", tag: `admin-${Date.now()}` }).catch(() => 0);
        result.push(n ? `푸시: ${n}대 기기` : "푸시: 받을 기기 없음");
      }
    }
    if (channel !== "push") {
      const sup = email ? await suppressedNow(email) : "메일 주소 없음";
      if (sup) result.push(`메일: 보내지 않음(${sup})`);
      else {
        const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 6px;font-size:13px;color:#6B7684">모두의카풀 운영팀</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">${esc(title)}</h1>
<div style="font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(msg)}</div>
</div></div>`;
        const ok = await deliver({ kind: "admin-direct", category: "transactional", to: email, userId, subject: `[모두의카풀] ${title}`, html, text: `${title}\n\n${msg}` }).catch(() => false);
        result.push(ok ? "메일: 보냄" : "메일: 실패");
      }
    }
    const summary = result.join(" · ");
    await sql`insert into admin_notify_log (target, channel, title, result) values (${target}, ${channel}, ${title}, ${summary})`;
    return json({ ok: true, result: summary });
  } catch (e) {
    return fail(e);
  }
}
