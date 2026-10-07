import { body, currentUserId, db, ensureSchema, fail, hasDb, isUuid, json, needLogin, photoUrl, text } from "@/lib/server";
import { samplePosts } from "@/lib/sample";
import { MAX_PRICE, nextOccurrence, priceAllowedAt, priceAllowedRegular, toMinutes, validDays } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 한국 주변 범위의 좌표만 받는다. 아니면 둘 다 null. */
function coord(lat: unknown, lng: unknown): [number | null, number | null] {
  const a = Number(lat);
  const o = Number(lng);
  const ok = lat != null && lng != null && Number.isFinite(a) && Number.isFinite(o) && a > 32 && a < 40 && o > 123 && o < 133;
  return ok ? [a, o] : [null, null];
}

/**
 * 비용 방식을 정한다. 금액 입력(fixed)은 허용 조건(allowed)을 만족할 때만,
 * 미터기 나눔은 출퇴근 카풀에서만 가능하고 그 밖에는 무료로 저장한다.
 */
function costOf(b: Record<string, unknown>, commute: boolean, allowed: boolean): { cost: string; price: number; error?: string } {
  if (b.cost === "fixed" && commute && allowed) {
    const price = Math.round(Number(b.price) / 100) * 100;
    if (!(price >= 500 && price <= MAX_PRICE)) return { cost: "free", price: 0, error: `금액은 500원에서 ${MAX_PRICE.toLocaleString("ko-KR")}원 사이로 입력해 주세요.` };
    return { cost: "fixed", price };
  }
  return { cost: b.cost === "meter" && commute ? "meter" : "free", price: 0 };
}

export async function GET(req: Request) {
  if (!hasDb()) return json({ sample: true, posts: samplePosts() });
  try {
    await ensureSchema();
    const me = await currentUserId();
    const mine = new URL(req.url).searchParams.get("mine") === "1";
    if (mine && !me) return needLogin();
    const sql = db();
    const rows = mine
      ? await sql`select p.*, u.name as owner, u.bio as owner_bio, u.photo_v from posts p join users u on u.id = p.user_id
                  where p.user_id = ${me} order by p.regular desc, p.depart_at desc limit 100`
      : await sql`select p.*, u.name as owner, u.bio as owner_bio, u.photo_v from posts p join users u on u.id = p.user_id
                  where p.status = 'open' and (p.regular or p.depart_at > now() - interval '2 hours')
                  order by p.depart_at asc limit 300`;
    const now = Date.now();
    const posts = rows.map((r) => ({
      id: r.id,
      owner: r.owner || "회원",
      ownerBio: r.owner_bio,
      ownerPhoto: photoUrl(r.user_id, r.photo_v),
      role: r.role,
      kind: r.kind,
      cost: r.cost,
      price: r.price,
      regular: r.regular,
      days: r.days,
      timeGo: r.time_go,
      timeBack: r.time_back,
      origin: r.origin,
      dest: r.dest,
      originLat: r.origin_lat,
      originLng: r.origin_lng,
      destLat: r.dest_lat,
      destLng: r.dest_lng,
      // 정기카풀은 다음 출발 시각을 그때그때 계산한다.
      departAt: r.regular ? nextOccurrence(String(r.days), String(r.time_go), now) : new Date(r.depart_at as string).getTime(),
      seats: r.seats,
      note: r.note,
      status: r.status,
      mine: !!me && r.user_id === me,
    }));
    if (!mine) posts.sort((a, b) => a.departAt - b.departAt);
    return json({ sample: false, posts });
  } catch (e) {
    return fail(e);
  }
}

/** 한 번짜리 카풀 등록 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const role = b.role === "rider" ? "rider" : "driver";
  const kind = b.kind === "trip" ? "trip" : "commute";
  const origin = text(b.origin, 60);
  const dest = text(b.dest, 60);
  const departAt = new Date(Number(b.departAt));
  const seats = Math.round(Number(b.seats));
  const [oLat, oLng] = coord(b.originLat, b.originLng);
  const [dLat, dLng] = coord(b.destLat, b.destLng);
  if (origin.length < 2 || dest.length < 2) return json({ error: "출발지와 도착지를 입력해 주세요." }, 400);
  if (Number.isNaN(departAt.getTime()) || departAt.getTime() < Date.now() - 3600_000 || departAt.getTime() > Date.now() + 90 * 86400_000)
    return json({ error: "출발 일시를 확인해 주세요." }, 400);
  if (!(seats >= 1 && seats <= 6)) return json({ error: "인원은 1~6명으로 입력해 주세요." }, 400);
  const c = costOf(b, kind === "commute", priceAllowedAt(departAt.getTime()));
  if (c.error) return json({ error: c.error }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const open = await sql`select count(*)::int as n from posts where user_id = ${me} and status = 'open' and not regular and depart_at > now()`;
    if ((open[0].n as number) >= 10) return json({ error: "진행 중인 글은 10개까지 올릴 수 있습니다." }, 429);
    const rows = await sql`
      insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng)
      values (${me}, ${role}, ${kind}, ${c.cost}, ${c.price}, ${origin}, ${dest}, ${departAt.toISOString()}, ${seats}, ${text(b.note, 300)},
              ${oLat}, ${oLng}, ${dLat}, ${dLng})
      returning id`;
    return json({ id: rows[0].id });
  } catch (e) {
    return fail(e);
  }
}

/** 내 출퇴근 정보를 정기카풀 글로 게시(이미 있으면 고친다). 회원당 하나만 둔다. */
export async function PUT(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const role = b.role === "rider" ? "rider" : "driver";
  const origin = text(b.origin, 60);
  const dest = text(b.dest, 60);
  const days = b.days;
  const timeGo = text(b.timeGo, 5);
  const timeBack = text(b.timeBack, 5);
  const seats = Math.round(Number(b.seats));
  const [oLat, oLng] = coord(b.originLat, b.originLng);
  const [dLat, dLng] = coord(b.destLat, b.destLng);
  if (origin.length < 2 || dest.length < 2) return json({ error: "출발지와 도착지를 입력해 주세요." }, 400);
  if (!validDays(days)) return json({ error: "출퇴근 요일을 하나 이상 골라 주세요." }, 400);
  if (toMinutes(timeGo) < 0 || (timeBack && toMinutes(timeBack) < 0)) return json({ error: "출발 시각을 확인해 주세요." }, 400);
  if (!(seats >= 1 && seats <= 6)) return json({ error: "인원은 1~6명으로 입력해 주세요." }, 400);
  const c = costOf(b, true, priceAllowedRegular(days, timeGo, timeBack));
  if (c.error) return json({ error: c.error }, 400);
  const sorted = [...days].sort().join("");
  const next = new Date(nextOccurrence(sorted, timeGo)).toISOString();
  try {
    await ensureSchema();
    const sql = db();
    const updated = await sql`
      update posts set role = ${role}, cost = ${c.cost}, price = ${c.price}, origin = ${origin}, dest = ${dest},
        origin_lat = ${oLat}, origin_lng = ${oLng}, dest_lat = ${dLat}, dest_lng = ${dLng},
        days = ${sorted}, time_go = ${timeGo}, time_back = ${timeBack}, depart_at = ${next},
        seats = ${seats}, note = ${text(b.note, 300)}, status = 'open'
      where user_id = ${me} and regular returning id`;
    if (updated.length) return json({ id: updated[0].id, updated: true });
    const rows = await sql`
      insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng,
                         regular, days, time_go, time_back)
      values (${me}, ${role}, 'commute', ${c.cost}, ${c.price}, ${origin}, ${dest}, ${next}, ${seats}, ${text(b.note, 300)},
              ${oLat}, ${oLng}, ${dLat}, ${dLng}, true, ${sorted}, ${timeGo}, ${timeBack})
      returning id`;
    return json({ id: rows[0].id, updated: false });
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
