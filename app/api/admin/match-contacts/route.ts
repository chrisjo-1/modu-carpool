import { ensureAccount, makeLink } from "@/lib/kakao";
import { matchesFor } from "@/lib/matchServer";
import { body, clientIp, currentUserId, db, ensureSchema, fail, isAdminMember, json, photoUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 앱 안 관리자 기능(2026-11-23 사용자 지시: "관리자 아이디로 로그인하면 그 글의 가능성 높은 경로·운전자·탑승자를 앱에서 바로 보고,
 * 전화번호도 같이 보고 문자를 보내 응답·가입을 유도"). 관리자 메일(ADMIN_EMAILS) 회원 또는 관리자 화면 로그인만.
 * GET ?post=글ID  : 글쓴이 + 매칭 회원(앱 글·워프 정기카풀) — 전화번호(워프 명단 phone 또는 앱 연락처가 휴대폰일 때)·가입 상태·알림 기기·지난 문자.
 *                  볼 때마다 phone_view_log(kind 'match', 글ID) 남김.
 * POST {post, userId?|warpId?, who: 'owner'|'match', chance?} : 그 사람용 짧은 링크(/s/코드, 14일 — 가입 미완료면 비번 설정, 그 뒤 글을 엶)와 문자 문구.
 *                  계정 없는 워프 회원은 임시 계정을 만든다(ensureAccount). 기록은 kakao_links(template_key 'match-invite').
 */
const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;
const phoneOf = (v: unknown) => {
  const s = String(v ?? "").replace(/[\s.]/g, "");
  return PHONE.test(s) ? s.replace(/-/g, "") : "";
};
const roleWord = (r: string) => (r === "driver" ? "운전자" : "탑승자");

type Contact = { phone: string; state: string; lastSeen: string | null; push: number; invitedAt: string | null; warpId: string };

async function contactsForUsers(ids: string[]): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>();
  if (!ids.length) return out;
  const rows = await db()`select u.id, u.contact, u.pw_reset_required, u.last_seen, u.withdrawn_at, u.blocked,
      (select l.phone from legacy_members l where l.matched_user = u.id and coalesce(l.phone, '') <> '' and not coalesce(l.withdrawn, false) order by (l.src_no like '신워프%') desc limit 1) as lphone,
      (select l.warp_id from legacy_members l where l.matched_user = u.id order by (l.src_no like '신워프%') desc limit 1) as wid,
      (select count(*)::int from push_subs s where s.user_id = u.id and s.paused_at is null) as push,
      (select max(k.created_at) from kakao_links k where k.user_id = u.id and k.template_key = 'match-invite') as invited
    from users u where u.id = any(${ids}::uuid[])`;
  for (const r of rows) {
    const state = r.blocked ? "정지" : r.withdrawn_at ? "탈퇴" : r.pw_reset_required ? "가입 미완료" : "가입 완료";
    out.set(String(r.id), {
      phone: phoneOf(r.lphone) || phoneOf(r.contact), state,
      lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null, push: Number(r.push) || 0,
      invitedAt: r.invited ? new Date(r.invited).toISOString() : null, warpId: String(r.wid ?? ""),
    });
  }
  return out;
}

async function contactsForWarp(warpIds: string[]): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>();
  if (!warpIds.length) return out;
  const rows = await db()`select upper(l.warp_id) as wid, l.phone, l.withdrawn, l.matched_user, u.pw_reset_required, u.last_seen,
      (select max(k.created_at) from kakao_links k where k.warp_id = l.warp_id and k.template_key = 'match-invite') as invited
    from legacy_members l left join users u on u.id = l.matched_user
    where upper(l.warp_id) = any(${warpIds}::text[])`;
  for (const r of rows) {
    const state = r.withdrawn ? "워프 탈퇴" : !r.matched_user ? "계정 없음" : r.pw_reset_required ? "가입 미완료" : "가입 완료";
    out.set(String(r.wid), {
      phone: r.withdrawn ? "" : phoneOf(r.phone), state,
      lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null, push: 0,
      invitedAt: r.invited ? new Date(r.invited).toISOString() : null, warpId: String(r.wid),
    });
  }
  return out;
}

export async function GET(req: Request) {
  const me = await currentUserId();
  if (!(await isAdminMember(me))) return json({ error: "관리자만 볼 수 있어요." }, 403);
  const postId = new URL(req.url).searchParams.get("post") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const own = await sql`select p.user_id, p.role, p.origin, p.dest, p.regular, p.source, u.member_code, u.name, u.photo_v
      from posts p join users u on u.id = p.user_id where p.id = ${postId}`;
    if (!own.length) return json({ error: "글을 찾을 수 없어요." }, 404);
    const { mine, items } = await matchesFor(postId);
    const userIds = [String(own[0].user_id), ...items.filter((m) => !m.warp && m.userId).map((m) => m.userId)];
    const warpIds = items.filter((m) => m.warp && m.warpId).map((m) => m.warpId);
    const [uc, wc] = await Promise.all([contactsForUsers(userIds), contactsForWarp(warpIds)]);
    await sql`insert into phone_view_log (kind, ref, ip) values ('match', ${postId}, ${clientIp(req)})`;
    const empty: Contact = { phone: "", state: "연락처 없음", lastSeen: null, push: 0, invitedAt: null, warpId: "" };
    const ownerId = String(own[0].user_id);
    return json({
      needDest: !mine || mine.workLat == null,
      owner: {
        userId: ownerId, code: String(own[0].member_code ?? ""), name: String(own[0].name ?? ""), role: String(own[0].role),
        photo: photoUrl(ownerId, Number(own[0].photo_v) || 0), warpPost: own[0].source === "warp", ...(uc.get(ownerId) ?? empty),
      },
      items: items.map((m) => {
        const c = m.warp ? (m.warpId ? wc.get(m.warpId) : undefined) : uc.get(m.userId);
        return {
          ...(c ?? empty),
          postId: m.postId, userId: m.warp ? "" : m.userId, warpId: m.warp ? m.warpId : c?.warpId ?? "", code: m.code, warp: m.warp,
          photo: m.warp ? "" : photoUrl(m.userId, m.photoV), role: m.role, regular: m.regular, origin: m.origin, dest: m.dest,
          days: m.days, timeGo: m.timeGo, departAt: m.departAt, chance: m.chance, timeFit: m.timeFit, onRoute: m.onRoute,
          homeKm: m.homeKm, workKm: m.workKm,
        };
      }),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const me = await currentUserId();
  if (!(await isAdminMember(me))) return json({ error: "관리자만 쓸 수 있어요." }, 403);
  try {
    await ensureSchema();
    const b = await body(req);
    const postId = String(b.post ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(postId)) return json({ error: "잘못된 요청입니다." }, 400);
    const sql = db();
    const p = await sql`select role, origin, dest from posts where id = ${postId}`;
    if (!p.length) return json({ error: "글을 찾을 수 없어요." }, 404);
    let userId = /^[0-9a-f-]{36}$/i.test(String(b.userId ?? "")) ? String(b.userId) : "";
    const warpId = String(b.warpId ?? "").toUpperCase().slice(0, 16);
    if (!userId && warpId) {
      const acc = await ensureAccount(warpId);
      if (!acc) return json({ error: "워프 탈퇴 회원이거나 명단에 없어서 링크를 만들 수 없어요." }, 400);
      userId = acc.userId;
    }
    if (!userId) return json({ error: "보낼 회원을 찾을 수 없어요." }, 400);
    const link = await makeLink(userId, warpId, "match-invite", `p:${postId}`);
    const route = `${p[0].origin} → ${p[0].dest}`;
    const chance = Math.max(0, Math.min(100, Math.round(Number(b.chance) || 0)));
    const count = Math.max(0, Math.round(Number(b.count) || 0));
    const text = b.who === "owner"
      ? `[모두의카풀] 안녕하세요, 워프 후속 플랫폼 모두의카풀입니다. 회원님이 올리신 카풀(${route})과 같은 길로 다니는 회원이 ${count ? `${count}명 ` : ""}있어요. 아래 링크로 들어와 확인하고 답해 보세요. \n${link}`
      : `[모두의카풀] 안녕하세요, 워프 후속 플랫폼 모두의카풀입니다. 회원님 출퇴근 길과 같은 방향의 ${roleWord(String(p[0].role))}가 있어요(${route}${chance ? `, 매칭 ${chance}%` : ""}). 아래 링크로 들어와 확인하고 신청해 보세요. \n${link}`;
    return json({ ok: true, link, text });
  } catch (e) {
    return fail(e);
  }
}
