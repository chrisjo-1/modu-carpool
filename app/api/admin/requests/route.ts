import { logOps } from "@/lib/opsLog";
import { ensureAccount, makeLink } from "@/lib/kakao";
import { deliver } from "@/lib/mail";
import { body, clientIp, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";
import { suppressedNow } from "@/lib/unsub";

export const dynamic = "force-dynamic";

const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;
const phoneOf = (v: unknown) => {
  const s = String(v ?? "").replace(/[\s.]/g, "");
  return PHONE.test(s) ? s.replace(/-/g, "") : "";
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/**
 * 관리자: 카풀 신청 목록(?status=pending|accepted|declined, 최근 200건).
 * 대기(pending) 신청은 글쓴이 연락 정보도 함께(2026-11-23 사용자 지시 '수락 대기 중인 회원에게 메일 발송, 휴대폰 번호 표시해 문자'):
 * 전화(워프 명단 phone 우선, 없으면 앱 연락처가 휴대폰일 때)·가입 상태·알림 기기·마지막 접속·지난 안내 메일/문자 링크 시각. 볼 때마다 phone_view_log(kind 'request').
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const st = new URL(req.url).searchParams.get("status") ?? "";
  const status = ["pending", "accepted", "declined"].includes(st) ? st : "";
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`
      select r.id, r.status, r.created_at, r.message, r.post_id,
             p.origin, p.dest, p.role, p.regular, p.depart_at, p.days, p.time_go, p.source,
             a.name as req_name, a.email as req_email, a.test as req_test,
             o.id as owner_id, o.name as owner_name, o.email as owner_email, o.member_code as owner_code,
             o.contact as owner_contact, o.pw_reset_required as owner_pw, o.last_seen as owner_seen,
             o.withdrawn_at as owner_withdrawn, o.blocked as owner_blocked,
             count(*) over () as total
      from requests r
      join posts p on p.id = r.post_id
      join users a on a.id = r.user_id
      join users o on o.id = p.user_id
      where (${status} = '' or r.status = ${status})
      order by r.created_at desc
      limit 200`;
    const pendingOwners = [...new Set(rows.filter((r) => r.status === "pending").map((r) => String(r.owner_id)))];
    const extra = new Map<string, { phone: string; warpId: string; push: number; invited: string | null; mailed: string | null }>();
    if (pendingOwners.length) {
      const ex = await sql`select u.id,
          (select l.phone from legacy_members l where l.matched_user = u.id and coalesce(l.phone, '') <> '' and not coalesce(l.withdrawn, false) order by (l.src_no like '신워프%') desc limit 1) as lphone,
          (select l.warp_id from legacy_members l where l.matched_user = u.id order by (l.src_no like '신워프%') desc limit 1) as wid,
          (select count(*)::int from push_subs s where s.user_id = u.id and s.paused_at is null) as push,
          (select max(k.created_at) from kakao_links k where k.user_id = u.id and k.template_key = 'req-invite') as invited,
          (select max(m.created_at) from mail_log m where m.kind = 'req-wait' and m.user_id = u.id and m.status = 'sent') as mailed
        from users u where u.id = any(${pendingOwners}::uuid[])`;
      for (const e of ex) extra.set(String(e.id), {
        phone: phoneOf(e.lphone), warpId: String(e.wid ?? ""), push: Number(e.push) || 0,
        invited: e.invited ? new Date(e.invited).toISOString() : null, mailed: e.mailed ? new Date(e.mailed).toISOString() : null,
      });
      await sql`insert into phone_view_log (kind, ref, ip) values ('request', ${`대기 신청 ${pendingOwners.length}명`}, ${clientIp(req)})`.catch(() => {});
    }
    return json({
      total: rows.length ? Number(rows[0].total) : 0,
      rows: rows.map((r) => {
        const x = r.status === "pending" ? extra.get(String(r.owner_id)) : undefined;
        return {
          id: r.id, status: r.status, message: r.message, origin: r.origin, dest: r.dest, role: r.role, regular: r.regular,
          days: r.days, time_go: r.time_go, depart_at: new Date(r.depart_at as string).getTime(), created_at: new Date(r.created_at as string).getTime(),
          req_name: r.req_name, req_email: r.req_email, req_test: r.req_test, owner_name: r.owner_name, owner_email: r.owner_email,
          owner: x ? {
            id: String(r.owner_id), code: String(r.owner_code ?? ""), phone: x.phone || phoneOf(r.owner_contact), warpId: x.warpId, push: x.push,
            state: r.owner_blocked ? "정지" : r.owner_withdrawn ? "탈퇴" : r.owner_pw ? "가입 미완료" : "가입 완료",
            lastSeen: r.owner_seen ? new Date(r.owner_seen as string).toISOString() : null, invited: x.invited, mailed: x.mailed,
            warpPost: r.source === "warp",
          } : null,
        };
      }),
    });
  } catch (e) {
    return fail(e);
  }
}

type Target = { reqId: string; postId: string; ownerId: string; email: string; warpId: string; route: string; count: number; blocked: boolean };

async function targetsFor(ids: string[]): Promise<Target[]> {
  const rows = await db()`select r.id, r.post_id, p.origin, p.dest, o.id as owner_id, o.email, o.withdrawn_at, o.blocked,
      (select l.warp_id from legacy_members l where l.matched_user = o.id order by (l.src_no like '신워프%') desc limit 1) as wid
    from requests r join posts p on p.id = r.post_id join users o on o.id = p.user_id
    where r.id = any(${ids}::uuid[]) and r.status = 'pending' order by r.created_at desc`;
  // 한 글쓴이에게 신청이 여러 건이면 한 번만(가장 최근 신청의 글로 안내)
  const byOwner = new Map<string, Target>();
  for (const r of rows) {
    const k = String(r.owner_id);
    const cur = byOwner.get(k);
    if (cur) cur.count += 1;
    else byOwner.set(k, {
      reqId: String(r.id), postId: String(r.post_id), ownerId: k, email: String(r.email ?? ""), warpId: String(r.wid ?? ""),
      route: `${r.origin} → ${r.dest}`, count: 1, blocked: !!r.withdrawn_at || !!r.blocked,
    });
  }
  return [...byOwner.values()];
}

const smsText = (t: Target, link: string) =>
  `[모두의카풀] 안녕하세요, 워프 후속 플랫폼 모두의카풀입니다. 회원님이 올리신 카풀(${t.route})에 함께 가고 싶다는 신청이 ${t.count > 1 ? `${t.count}건 ` : ""}왔어요. 아래 링크로 들어와 확인하고 수락해 주세요. \n${link}`;

/**
 * POST {action:'mail', ids:[신청ID…]} : 대기 신청의 글쓴이에게 안내 메일(회원별 14일 링크 /s/코드 → 가입 미완료면 비번 설정 → 그 글).
 *        같은 글쓴이는 하루 한 번(mail_log kind 'req-wait'), 수신거부·탈퇴 주소 제외.
 * POST {action:'sms', id:신청ID} : 같은 링크가 담긴 문자 문구.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const b = await body(req);
    const sql = db();
    if (b.action === "sms") {
      const id = String(b.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "잘못된 요청입니다." }, 400);
      const [t] = await targetsFor([id]);
      if (!t) return json({ error: "대기 중인 신청이 아니에요." }, 400);
      if (t.blocked) return json({ error: "탈퇴·정지한 회원이에요." }, 400);
      if (t.warpId) await ensureAccount(t.warpId).catch(() => null);
      const link = await makeLink(t.ownerId, t.warpId, "req-invite", `p:${t.postId}`);
      return json({ ok: true, text: smsText(t, link) });
    }
    if (b.action !== "mail") return json({ error: "잘못된 요청입니다." }, 400);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((v: string) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, 200);
    if (!ids.length) return json({ error: "보낼 신청을 골라 주세요." }, 400);
    const targets = await targetsFor(ids);
    let sent = 0;
    const skipped: string[] = [];
    for (const t of targets) {
      if (t.blocked) { skipped.push("탈퇴·정지"); continue; }
      if (!t.email) { skipped.push("메일 없음"); continue; }
      const today = await sql`select 1 from mail_log where kind = 'req-wait' and user_id = ${t.ownerId} and status = 'sent' and created_at > now() - interval '20 hours' limit 1`;
      if (today.length) { skipped.push("오늘 이미 보냄"); continue; }
      const sup = await suppressedNow(t.email);
      if (sup) { skipped.push(sup); continue; }
      const link = await makeLink(t.ownerId, t.warpId, "req-invite", `p:${t.postId}`);
      const title = t.count > 1 ? `회원님 카풀에 신청이 ${t.count}건 왔어요` : "회원님 카풀에 함께 가고 싶다는 신청이 왔어요";
      const html = `<div style="background:#F5F7FA;padding:24px 12px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px">
<p style="margin:0 0 6px;font-size:13px;color:#6B7684">워프 후속 플랫폼 모두의카풀</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">${esc(title)}</h1>
<p style="margin:0 0 8px;font-size:15px;line-height:1.7">회원님이 올리신 카풀에 함께 가고 싶다는 신청이 와서 회원님의 수락을 기다리고 있어요.</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;background:#F5F7FA;border-radius:10px;padding:12px 14px"><b>${esc(t.route)}</b></p>
<a href="${link}" style="display:block;text-align:center;background:#1E3A8A;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px;border-radius:12px">신청 확인하고 수락하기</a>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6B7684">아직 비밀번호를 정하지 않으셨다면 버튼을 누른 뒤 비밀번호만 정하면 바로 그 글이 열려요. 링크는 14일 동안 쓸 수 있어요.</p>
</div></div>`;
      const text = `${title}\n\n회원님이 올리신 카풀(${t.route})에 함께 가고 싶다는 신청이 와서 수락을 기다리고 있어요.\n아래 링크로 들어와 확인하고 수락해 주세요.\n${link}`;
      const ok = await deliver({ kind: "req-wait", category: "transactional", to: t.email, userId: t.ownerId, subject: `[모두의카풀] ${title}`, html, text }).catch(() => false);
      if (ok) sent += 1;
      else skipped.push("발송 실패");
    }
    const summary = skipped.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
    await logOps("admin", "수락 대기 신청 글쓴이 메일", `보냄 ${sent} · 건너뜀 ${skipped.length}`).catch(() => {});
    return json({ ok: true, sent, owners: targets.length, skipped: summary });
  } catch (e) {
    return fail(e);
  }
}
