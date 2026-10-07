import { body, checkAdminPassword, clearCookie, clientIp, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, setAdminSession, text } from "@/lib/server";

export const dynamic = "force-dynamic";

const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 현황, 최근 글, 회원 목록(?q= 로 이메일·닉네임 검색) */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ admin: false });
  if (!hasDb()) return json({ admin: true, db: false, stats: null, posts: [], users: [], reports: [], blocks: [] });
  const q = text(new URL(req.url).searchParams.get("q"), 60);
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  try {
    await ensureSchema();
    const sql = db();
    const s = await sql`select
      (select count(*)::int from users) as users,
      (select count(*)::int from users where blocked) as blocked,
      (select count(*)::int from posts) as posts,
      (select count(*)::int from requests) as requests,
      (select count(*)::int from requests where status = 'accepted') as accepted,
      (select count(*)::int from reports where status = 'open') as reports`;
    const posts = await sql`
      select p.id, p.origin, p.dest, p.depart_at, p.role, p.kind, p.cost, p.price, p.regular, p.days, p.time_go, p.status, p.note, u.email, u.name, u.blocked
      from posts p join users u on u.id = p.user_id order by p.created_at desc limit 200`;
    const users = await sql`
      select u.id, u.email, u.name, u.blocked, u.created_at,
             (select count(*)::int from posts where user_id = u.id) as posts
      from users u
      where ${q} = '' or u.email ilike ${like} or u.name ilike ${like}
      order by u.created_at desc limit 200`;
    const reports = await sql`
      select r.id, r.reason, r.detail, r.status, r.created_at,
             a.name as reporter_name, a.email as reporter_email, b.id as target_id, b.name as target_name, b.email as target_email, b.blocked as target_blocked
      from reports r join users a on a.id = r.reporter join users b on b.id = r.target
      order by (r.status = 'open') desc, r.created_at desc limit 200`;
    const blocks = await sql`
      select k.reason, k.detail, k.created_at,
             a.name as blocker_name, a.email as blocker_email, b.id as target_id, b.name as target_name, b.email as target_email, b.blocked as target_blocked
      from blocks k join users a on a.id = k.blocker join users b on b.id = k.blocked
      order by k.created_at desc limit 200`;
    const ms = (rows: Record<string, unknown>[]) => rows.map((r) => ({ ...r, created_at: new Date(r.created_at as string).getTime() }));
    return json({
      admin: true,
      db: true,
      reports: ms(reports),
      blocks: ms(blocks),
      stats: s[0],
      posts: posts.map((p) => ({ ...p, depart_at: new Date(p.depart_at as string).getTime() })),
      users: users.map((u) => ({ ...u, created_at: new Date(u.created_at as string).getTime() })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const b = await body(req);
  await new Promise((r) => setTimeout(r, 400)); // 무차별 대입 완화
  const ip = clientIp(req);
  // 틀린 시도를 DB에 기록해, 같은 곳에서 15분에 5번 또는 전체 30번을 넘으면 잠근다.
  let record: ((ok: boolean) => Promise<void>) | null = null;
  if (hasDb()) {
    try {
      await ensureSchema();
      const sql = db();
      const n = await sql`select
        (select count(*)::int from admin_attempts where ip = ${ip} and at > now() - interval '15 minutes') as mine,
        (select count(*)::int from admin_attempts where at > now() - interval '15 minutes') as everyone`;
      if ((n[0].mine as number) >= 5 || (n[0].everyone as number) >= 30)
        return json({ error: "로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요." }, 429);
      record = async (ok) => {
        if (ok) await sql`delete from admin_attempts where ip = ${ip} or at < now() - interval '1 day'`;
        else await sql`insert into admin_attempts (ip) values (${ip})`;
      };
    } catch (e) {
      return fail(e);
    }
  }
  const ok = checkAdminPassword(typeof b.password === "string" ? b.password : "");
  await record?.(ok).catch((e) => console.error("[admin]", e));
  if (!ok) return json({ error: "비밀번호가 맞지 않습니다." }, 401);
  await setAdminSession();
  return json({ ok: true });
}

/** 회원 차단·해제({userId, blocked}) 또는 글 수정({postId, origin, dest, note, status}) */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();
    if (isUuid(b.userId)) {
      await sql`update users set blocked = ${b.blocked === true} where id = ${b.userId}`;
      return json({ ok: true });
    }
    if (isUuid(b.reportId)) {
      await sql`update reports set status = ${b.status === "open" ? "open" : "done"} where id = ${b.reportId}`;
      return json({ ok: true });
    }
    if (isUuid(b.postId)) {
      const origin = text(b.origin, 60);
      const dest = text(b.dest, 60);
      if (origin.length < 2 || dest.length < 2) return json({ error: "출발지와 도착지를 입력해 주세요." }, 400);
      const status = b.status === "closed" ? "closed" : "open";
      await sql`update posts set origin = ${origin}, dest = ${dest}, note = ${text(b.note, 300)}, status = ${status} where id = ${b.postId}`;
      return json({ ok: true });
    }
    return json({ error: "잘못된 요청입니다." }, 400);
  } catch (e) {
    return fail(e);
  }
}

/** ?post=ID 가 있으면 글 삭제, 없으면 관리자 로그아웃 */
export async function DELETE(req: Request) {
  const post = new URL(req.url).searchParams.get("post");
  if (!post) {
    await clearCookie("admin");
    return json({ ok: true });
  }
  if (!(await isAdmin())) return denied();
  if (!isUuid(post) || !hasDb()) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from posts where id = ${post}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
