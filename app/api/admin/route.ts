import { driverTier } from "@/lib/types";
import { sendSuspendMail } from "@/lib/mail";
import { authEnabled, body, carPhotoUrl, checkAdminPassword, clearCookie, clientIp, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, photoUrl, setAdminSession, setUserSession, text } from "@/lib/server";

export const dynamic = "force-dynamic";

const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 현황, 최근 글, 회원 목록(?q= 로 이메일·닉네임 검색) */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ admin: false });
  if (!hasDb()) return json({ admin: true, db: false, stats: null, posts: [], users: [], reports: [], blocks: [] });
  // 워프 이전 기록 수정 내역(?legacyLog=회원ID)
  const logFor = new URL(req.url).searchParams.get("legacyLog");
  if (logFor) {
    if (!isUuid(logFor)) return json({ error: "잘못된 요청입니다." }, 400);
    try {
      await ensureSchema();
      const rows = await db()`select stars, count, memo, created_at from legacy_stats_log where user_id = ${logFor} order by created_at desc limit 10`;
      return json({ log: rows.map((r) => ({ stars: Number(r.stars), count: Number(r.count), memo: String(r.memo), at: new Date(r.created_at as string).getTime() })) });
    } catch (e) {
      return fail(e);
    }
  }
  const q = text(new URL(req.url).searchParams.get("q"), 60);
  // 회원 정렬: joined 가입일(기본) · seen 최근 접속 · post 최근 작성 · credits 크레딧 많은 · posts 글 많은
  const sortIn = new URL(req.url).searchParams.get("sort") ?? "";
  const sort = ["seen", "post", "credits", "posts"].includes(sortIn) ? sortIn : "joined";
  // 회원 필터(서버에서 전체 회원 대상으로 건다). 운전자 = 희망 역할 운전자·차량번호 등록·운전자 글, 탑승자 = 희망 역할 탑승자·탑승자 글
  const roleIn = new URL(req.url).searchParams.get("role") ?? "";
  const role = ["driver", "rider", "none"].includes(roleIn) ? roleIn : "";
  const genIn = new URL(req.url).searchParams.get("gender") ?? "";
  const gender = ["female", "male"].includes(genIn) ? genIn : "";
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
      select p.id, p.origin, p.dest, p.depart_at, p.role, p.kind, p.cost, p.price, p.regular, p.days, p.time_go, p.status, p.note, u.email, u.name, u.blocked, u.test
      from posts p join users u on u.id = p.user_id order by p.created_at desc limit 200`;
    const users = await sql`
      select u.id, u.email, u.name, u.member_code, u.blocked, u.test, u.credits, u.created_at, u.last_seen, u.bio, u.contact, u.contact_type,
             u.gender, u.role_pref, u.join_source, u.photo_v, u.car_v, u.car_no, u.tier_set, u.interests, u.legacy_stars, u.legacy_reviews, u.legacy_rides,
             exists (select 1 from legacy_members l where l.matched_user = u.id) as is_warp,
             u.commute_kind, u.commute_origin, u.commute_dest, u.commute_time, u.commute_price,
             (select count(*)::int from posts where user_id = u.id) as posts,
             (select count(*)::int from posts where user_id = u.id and role = 'driver') as driver_posts,
             (select count(*)::int from posts where user_id = u.id and role = 'rider') as rider_posts,
             (select max(created_at) from posts where user_id = u.id) as last_post_at
      from users u
      where (${q} = '' or u.email ilike ${like} or u.name ilike ${like})
        and (${gender} = '' or u.gender = ${gender})
        and (${role} = ''
          or (${role} = 'driver' and (u.role_pref = 'driver' or coalesce(u.car_no, '') <> '' or exists (select 1 from posts where user_id = u.id and role = 'driver')))
          or (${role} = 'rider' and (u.role_pref = 'rider' or exists (select 1 from posts where user_id = u.id and role = 'rider')))
          or (${role} = 'none' and coalesce(u.role_pref, '') = '' and coalesce(u.car_no, '') = '' and not exists (select 1 from posts where user_id = u.id)))
      order by
        (case when ${sort} = 'joined' then u.test end) desc nulls last,
        (case when ${sort} = 'seen' then u.last_seen end) desc nulls last,
        (case when ${sort} = 'post' then (select max(created_at) from posts where user_id = u.id) end) desc nulls last,
        (case when ${sort} = 'credits' then u.credits end) desc nulls last,
        (case when ${sort} = 'posts' then (select count(*) from posts where user_id = u.id) end) desc nulls last,
        u.created_at desc
      limit 200`;
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
      users: users.map((u) => ({
        ...u,
        created_at: new Date(u.created_at as string).getTime(),
        lastSeen: u.last_seen ? new Date(u.last_seen as string).getTime() : null,
        lastPost: u.last_post_at ? new Date(u.last_post_at as string).getTime() : null,
        photo: photoUrl(u.id, u.photo_v),
        carPhoto: carPhotoUrl(u.id, u.car_v),
        tier: driverTier({ carNo: u.car_no, carPhoto: carPhotoUrl(u.id, u.car_v), photo: photoUrl(u.id, u.photo_v), tierSet: u.tier_set }),
      })),
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
        const rows = await sql`insert into users (email, pw, name, test, email_verified, terms_at) values (${`test-${tag}@test.invalid`}, ${`!${crypto.randomUUID()}`}, ${name}, true, true, now()) returning id`;
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
      // 프로필 사진만 삭제(신고된 타인 사진 처리)
      if (b.removePhoto === true) {
        await sql`update users set photo = '', photo_v = 0 where id = ${b.userId}`;
        return json({ ok: true });
      }
      // 워프 이전 기록: 별점(평균)과 횟수(n회). 근거 메모가 있어야 저장하고, 고친 내역을 남긴다.
      if (b.legacyStats && typeof b.legacyStats === "object") {
        const ls = b.legacyStats as Record<string, unknown>;
        const stars = Math.round(Math.min(5, Math.max(0, Number(ls.stars) || 0)) * 10) / 10;
        const count = Math.min(100000, Math.max(0, Math.floor(Number(ls.count) || 0)));
        const memo = text(ls.memo, 200);
        if (memo.length < 5) return json({ error: "근거 메모를 5자 이상 적어 주세요. 예: 워프 앱 프로필 캡처 확인" }, 400);
        const warp = await sql`select 1 from legacy_members where matched_user = ${b.userId} limit 1`;
        if (!warp.length) return json({ error: "워프에서 넘어온 회원만 이전 기록을 넣을 수 있어요." }, 400);
        if (count > 0 && stars === 0) return json({ error: "횟수가 있으면 별점(평균)을 함께 넣어 주세요." }, 400);
        await sql`update users set legacy_stars = ${stars}, legacy_reviews = ${count}, legacy_rides = ${count} where id = ${b.userId}`;
        await sql`insert into legacy_stats_log (user_id, stars, count, memo) values (${b.userId}, ${stars}, ${count}, ${memo})`;
        return json({ ok: true });
      }
      // 운전자 등급 지정('' = 자동 판정, silver, gold)
      if (typeof b.tierSet === "string") {
        const t = b.tierSet === "silver" || b.tierSet === "gold" ? b.tierSet : "";
        const r = await sql`update users set tier_set = ${t} where id = ${b.userId} returning id`;
        if (!r.length) return json({ error: "회원을 찾을 수 없습니다." }, 404);
        return json({ ok: true });
      }
      const before = await sql`select email, name, blocked from users where id = ${b.userId}`;
      if (!before.length) return json({ error: "회원을 찾을 수 없습니다." }, 404);
      const blocked = b.blocked === true;
      await sql`update users set blocked = ${blocked} where id = ${b.userId}`;
      // 이용 정지(새로 정지한 경우)에만 안내 메일을 보낸다
      let mailed: boolean | null = null;
      if (blocked && !before[0].blocked && b.notify === true) {
        mailed = await sendSuspendMail(String(before[0].email), String(before[0].name ?? ""), text(b.reason, 100));
      }
      return json({ ok: true, mailed });
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
      // 회원의 글·신청·대화·크레딧 등 관련 기록은 외래키 cascade 로 함께 지워진다.
      const gone = await db()`delete from users where id = ${user} returning id`;
      return gone.length ? json({ ok: true }) : json({ error: "회원을 찾을 수 없습니다." }, 404);
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
