import { body, currentUserId, db, ensureSchema, fail, hasDb, isUuid, json, needLogin, text } from "@/lib/server";
import { samplePosts } from "@/lib/sample";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!hasDb()) return json({ sample: true, posts: samplePosts() });
  try {
    await ensureSchema();
    const me = await currentUserId();
    const mine = new URL(req.url).searchParams.get("mine") === "1";
    if (mine && !me) return needLogin();
    const sql = db();
    const rows = mine
      ? await sql`select p.*, u.name as owner, u.bio as owner_bio from posts p join users u on u.id = p.user_id
                  where p.user_id = ${me} order by p.depart_at desc limit 100`
      : await sql`select p.*, u.name as owner, u.bio as owner_bio from posts p join users u on u.id = p.user_id
                  where p.status = 'open' and p.depart_at > now() - interval '2 hours'
                  order by p.depart_at asc limit 200`;
    return json({
      sample: false,
      posts: rows.map((r) => ({
        id: r.id,
        owner: r.owner || "회원",
        ownerBio: r.owner_bio,
        role: r.role,
        kind: r.kind,
        cost: r.cost,
        origin: r.origin,
        dest: r.dest,
        departAt: new Date(r.depart_at as string).getTime(),
        seats: r.seats,
        note: r.note,
        status: r.status,
        mine: !!me && r.user_id === me,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const role = b.role === "rider" ? "rider" : "driver";
  const kind = b.kind === "trip" ? "trip" : "commute";
  // 비용 나눔은 출퇴근 카풀에서만 선택할 수 있다.
  const cost = b.cost === "meter" && kind === "commute" ? "meter" : "free";
  const origin = text(b.origin, 60);
  const dest = text(b.dest, 60);
  const departAt = new Date(Number(b.departAt));
  const seats = Math.round(Number(b.seats));
  if (origin.length < 2 || dest.length < 2) return json({ error: "출발지와 도착지를 입력해 주세요." }, 400);
  if (Number.isNaN(departAt.getTime()) || departAt.getTime() < Date.now() - 3600_000 || departAt.getTime() > Date.now() + 90 * 86400_000)
    return json({ error: "출발 일시를 확인해 주세요." }, 400);
  if (!(seats >= 1 && seats <= 6)) return json({ error: "인원은 1~6명으로 입력해 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const open = await sql`select count(*)::int as n from posts where user_id = ${me} and status = 'open' and depart_at > now()`;
    if ((open[0].n as number) >= 10) return json({ error: "진행 중인 글은 10개까지 올릴 수 있습니다." }, 429);
    const rows = await sql`
      insert into posts (user_id, role, kind, cost, origin, dest, depart_at, seats, note)
      values (${me}, ${role}, ${kind}, ${cost}, ${origin}, ${dest}, ${departAt.toISOString()}, ${seats}, ${text(b.note, 300)})
      returning id`;
    return json({ id: rows[0].id });
  } catch (e) {
    return fail(e);
  }
}

/** 마감 처리 */
export async function PATCH(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.id)) return json({ error: "잘못된 요청입니다." }, 400);
  const status = b.status === "open" ? "open" : "closed";
  try {
    await ensureSchema();
    await db()`update posts set status = ${status} where id = ${b.id} and user_id = ${me}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from posts where id = ${id} and user_id = ${me}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
