import { authEnabled, body, checkAdminPassword, clearCookie, clientIp, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, setAdminSession, setUserSession, text } from "@/lib/server";

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
      select u.id, u.email, u.name, u.blocked, u.test, u.credits, u.created_at,
             (select count(*)::int from posts where user_id = u.id) as posts
      from users u
      where ${q} = '' or u.email ilike ${like} or u.name ilike ${like}
      order by u.test desc, u.created_at desc limit 200`;
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
  // 테스트 회원 만들기 / 테스트 회원 화면으로 들어가기 (관리자만, 테스트 회원에게만)
  if (b.action === "testUser" || b.action === "enter") {
    if (!(await isAdmin())) return denied();
    if (!authEnabled()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
    try {
      await ensureSchema();
      const sql = db();
      if (b.action === "testUser") {
        const n = await sql`select count(*)::int as n from users where test`;
        if ((n[0].n as number) >= 30) return json({ error: "테스트 회원은 30명까지 만들 수 있습니다. 안 쓰는 회원을 삭제해 주세요." }, 400);
        const tag = crypto.randomUUID().slice(0, 8);
        const name = text(b.name, 20) || `테스트${tag.slice(0, 4)}`;
        // 비밀번호 칸에는 맞출 수 없는 값을 넣어, 관리자 화면을 통해서만 들어갈 수 있게 한다.
        const rows = await sql`insert into users (email, pw, name, test) values (${`test-${tag}@test.invalid`}, ${`!${crypto.randomUUID()}`}, ${name}, true) returning id`;
        return json({ ok: true, id: rows[0].id });
      }
      if (!isUuid(b.userId)) return json({ error: "잘못된 요청입니다." }, 400);
      const u = await sql`select test, blocked from users where id = ${b.userId}`;
      if (!u.length || !u[0].test) return json({ error: "테스트 회원으로만 들어갈 수 있습니다." }, 403);
      if (u[0].blocked) return json({ error: "차단된 회원입니다. 차단을 풀고 들어가 주세요." }, 400);
      await setUserSession(b.userId);
      return json({ ok: true });
    } catch (e) {
      return fail(e);
    }
  }
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
      const status = b.status === "closed" ? "closed" : b.status === "progress" ? "progress" : "open";
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
  const user = new URL(req.url).searchParams.get("user");
  if (user) {
    if (!(await isAdmin())) return denied();
    if (!isUuid(user) || !hasDb()) return json({ error: "잘못된 요청입니다." }, 400);
    try {
      await ensureSchema();
      const gone = await db()`delete from users where id = ${user} and test returning id`;
      return gone.length ? json({ ok: true }) : json({ error: "테스트 회원만 삭제할 수 있습니다." }, 403);
    } catch (e) {
      return fail(e);
    }
  }
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
