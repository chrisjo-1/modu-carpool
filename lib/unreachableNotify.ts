import { deliver } from "./mail";
import { db } from "./server";
import { SITE_URL } from "./site";

/**
 * 답이 늦을 수 있는 카풀 신청을 관리자에게 알린다(2026-11-17 사용자 지시: '워프동기화나 카풀 게시물이 등록됐는데 회원이 가입을 안 했거나
 * 알림을 꺼 놓았으면 신청해도 답이 없을 수 있으니, 누구로부터 신청을 받았는지 양쪽 연락처와 함께 관리자에게 보내 줘').
 * 글쓴이가 ①가입을 끝내지 않음(비번 미설정) ②알림 받을 기기 없음(멈추지 않은 push_subs 0) ③30일 넘게 접속 없음 중 하나면
 * ADMIN_EMAILS 전원에게 메일. 전화번호는 이 관리자 메일에만 넣는다(회원 메일·CSV에는 넣지 않는 규칙은 그대로).
 */
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const kst = (t: unknown) => (t ? new Date(new Date(t as string).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "없음");

type Person = { id: string; name: string; email: string; code: string; contact: string; ctype: string; phone: string; warpId: string; joined: boolean; devices: number; lastSeen: unknown };

async function person(id: string): Promise<Person | null> {
  const r = (await db()`
    select u.id, u.name, u.email, u.member_code, u.contact, u.contact_type, u.pw_reset_required, u.last_seen,
      (select count(*)::int from push_subs s where s.user_id = u.id and s.paused_at is null) as devices,
      l.phone, l.warp_id
    from users u
    left join lateral (select phone, warp_id from legacy_members l where (l.matched_user = u.id or lower(l.email_norm) = lower(u.email)) and not l.withdrawn
      order by (l.matched_user = u.id) desc, (l.src_no like '신워프%') desc limit 1) l on true
    where u.id = ${id}`)[0];
  if (!r) return null;
  return {
    id: String(r.id), name: String(r.name ?? ""), email: String(r.email ?? ""), code: String(r.member_code ?? ""),
    contact: String(r.contact ?? ""), ctype: String(r.contact_type ?? ""), phone: String(r.phone ?? ""), warpId: String(r.warp_id ?? ""),
    joined: !r.pw_reset_required, devices: Number(r.devices ?? 0), lastSeen: r.last_seen,
  };
}

function reasons(p: Person): string[] {
  const out: string[] = [];
  if (!p.joined) out.push("가입을 끝내지 않음(비밀번호 미설정)");
  if (p.devices === 0) out.push("알림 받을 기기 없음");
  const seen = p.lastSeen ? new Date(p.lastSeen as string).getTime() : 0;
  if (!seen) out.push("접속 기록 없음");
  else if (Date.now() - seen > 30 * 86_400_000) out.push("30일 넘게 접속 없음");
  return out;
}

const rows = (p: Person) => [
  ["고유코드", p.code || "-"], ["닉네임", p.name || "-"], ["이메일", p.email || "-"],
  ["연락처(앱)", p.contact ? `${p.contact}${p.ctype ? ` (${p.ctype})` : ""}` : "-"],
  ["워프 명단 전화", p.phone || "-"], ["워프 고유번호", p.warpId || "-"],
  ["가입", p.joined ? "완료" : "미완료(임시 계정)"], ["알림 기기", `${p.devices}대`], ["마지막 접속", kst(p.lastSeen)],
];
const table = (title: string, p: Person) =>
  `<h3 style="margin:16px 0 6px;font-size:15px">${title}</h3><table cellpadding="4" style="border-collapse:collapse;font-size:13px">${rows(p).map(([k, v]) => `<tr><td style="color:#64748b">${k}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>`;
const lines = (title: string, p: Person) => `[${title}]\n` + rows(p).map(([k, v]) => `${k}: ${v}`).join("\n");

export async function notifyUnreachableRequest(postId: string, requesterId: string, message: string) {
  const to = adminEmails();
  if (!to.length) return;
  const sql = db();
  const post = (await sql`select id, user_id, role, origin, dest, origin_area, dest_area, depart_at, regular, time_go, time_back, price, cost, source from posts where id = ${postId}`)[0];
  if (!post) return;
  const owner = await person(String(post.user_id));
  if (!owner) return;
  const why = reasons(owner);
  if (!why.length) return;
  // 같은 글·같은 신청자는 한 번만
  const once = await sql`insert into settings (key, value) values (${`unreach:${postId}:${requesterId}`}, ${new Date().toISOString()}) on conflict (key) do nothing returning key`;
  if (!once.length) return;
  const req = await person(requesterId);
  if (!req) return;

  const when = post.regular ? `정기카풀 · 출근 ${post.time_go || "-"} / 퇴근 ${post.time_back || "-"}` : `${kst(post.depart_at)} 출발`;
  const price = post.cost === "free" ? "무료" : Number(post.price) ? `${Number(post.price).toLocaleString("ko-KR")}원` : "금액 없음";
  const route = `${post.origin} → ${post.dest}`;
  const link = `${SITE_URL}/post/${post.id}`;
  const ownerRole = post.role === "driver" ? "운전자" : "탑승자";
  const subject = `[모두의카풀 관리자] 답이 늦을 수 있는 카풀 신청 · ${owner.code || owner.name} ← ${req.code || req.name}`;
  const html = `<div style="font-family:sans-serif;color:#0f172a;max-width:600px">
    <h2 style="font-size:17px;margin:0 0 6px">글쓴이가 신청에 답하기 어려울 수 있어요</h2>
    <p style="margin:0 0 10px;padding:8px 10px;border-radius:8px;background:#FFF4EC;color:#C2410C;font-size:13px">이유: ${esc(why.join(" · "))}</p>
    <table cellpadding="4" style="border-collapse:collapse;font-size:13px">
      <tr><td style="color:#64748b">글</td><td><b>${esc(route)}</b>${post.source === "warp" ? " · 워프에서 옮긴 글" : ""}</td></tr>
      <tr><td style="color:#64748b">지역</td><td>${esc(post.origin_area || "-")} → ${esc(post.dest_area || "-")}</td></tr>
      <tr><td style="color:#64748b">일시</td><td>${esc(when)}</td></tr>
      <tr><td style="color:#64748b">금액</td><td>${esc(price)}</td></tr>
      <tr><td style="color:#64748b">글 보기</td><td><a href="${link}">${link}</a></td></tr>
    </table>
    ${table(`글쓴이 (${ownerRole})`, owner)}
    ${table("신청한 회원", req)}
    ${message ? `<p style="margin:10px 0 0;font-size:13px"><span style="color:#64748b">신청 메시지</span><br>${esc(message)}</p>` : ""}
    <p style="margin-top:16px;font-size:12px;color:#64748b">관리자에게만 가는 메일이에요. 연락처는 연결 안내에만 쓰고 전달하지 마세요. 같은 글·같은 신청자는 한 번만 알려요.</p></div>`;
  const textBody = `글쓴이가 신청에 답하기 어려울 수 있어요\n이유: ${why.join(" · ")}\n\n글: ${route}${post.source === "warp" ? " (워프에서 옮긴 글)" : ""}\n일시: ${when}\n금액: ${price}\n${link}\n\n${lines(`글쓴이 (${ownerRole})`, owner)}\n\n${lines("신청한 회원", req)}${message ? `\n\n신청 메시지: ${message}` : ""}`;
  for (const addr of to) {
    await deliver({ kind: "unreachable-request-admin", category: "transactional", to: addr, subject, html, text: textBody }).catch(() => false);
  }
}
