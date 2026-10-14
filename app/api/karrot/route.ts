import { KARROT_LINK_HINT, KARROT_MAX_ITEMS, KARROT_MAX_PHOTOS, isKarrotLink, parseKarrotPhoto } from "@/lib/karrot";
import { body, currentUserId, db, ensureSchema, fail, isUuid, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

type Item = { id: string; user_id: string; title: string; note: string; link: string; photos: string[]; created_at: string };
const view = (r: Item, me: string) => ({ id: r.id, title: r.title, note: r.note, link: r.link, photos: r.photos, mine: r.user_id === me });

/** 나의 당근함 목록(로그인 회원만). ?q= 키워드(제목·설명), ?mine=1 내 물품만 */
export async function GET(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  const mine = sp.get("mine") === "1";
  try {
    await ensureSchema();
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const rows = (await db()`
      select id, user_id, title, note, link, photos, created_at from karrot_items
      where (${mine} = false or user_id = ${me})
        and (${q} = '' or title ilike ${like} or note ilike ${like})
      order by created_at desc limit 200`) as Item[];
    return json({ items: rows.map((r) => view(r, me)) });
  } catch (e) {
    return fail(e);
  }
}

/** 물품 등록 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const title = String(b.title ?? "").trim();
  const note = String(b.note ?? "").trim();
  const link = String(b.link ?? "").trim();
  const raw = Array.isArray(b.photos) ? b.photos : [];
  if (!title || title.length > 40) return json({ error: "제목을 40자 이내로 입력해 주세요." }, 400);
  if (note.length > 300) return json({ error: "설명은 300자 이내로 입력해 주세요." }, 400);
  if (!isKarrotLink(link)) return json({ error: KARROT_LINK_HINT }, 400);
  if (raw.length < 1 || raw.length > KARROT_MAX_PHOTOS) return json({ error: `사진은 1~${KARROT_MAX_PHOTOS}장 올려 주세요.` }, 400);
  const photos: string[] = [];
  for (const r of raw) {
    const p = parseKarrotPhoto(r);
    if (!p) return json({ error: "사진 파일을 확인해 주세요." }, 400);
    photos.push(p);
  }
  try {
    await ensureSchema();
    const cnt = await db()`select count(*)::int as n from karrot_items where user_id = ${me}`;
    if (Number(cnt[0]?.n ?? 0) >= KARROT_MAX_ITEMS) return json({ error: `물품은 ${KARROT_MAX_ITEMS}개까지 등록할 수 있어요.` }, 400);
    const rows = (await db()`
      insert into karrot_items (user_id, title, note, link, photos) values (${me}, ${title}, ${note}, ${link}, ${photos}::text[])
      returning id, user_id, title, note, link, photos, created_at`) as Item[];
    return json({ item: view(rows[0], me) });
  } catch (e) {
    return fail(e);
  }
}

/** 물품 수정(본인 것만). {id, title, note, link, photos} */
export async function PATCH(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.id)) return json({ error: "잘못된 요청입니다." }, 400);
  const title = String(b.title ?? "").trim();
  const note = String(b.note ?? "").trim();
  const link = String(b.link ?? "").trim();
  const raw = Array.isArray(b.photos) ? b.photos : [];
  if (!title || title.length > 40) return json({ error: "제목을 40자 이내로 입력해 주세요." }, 400);
  if (note.length > 300) return json({ error: "설명은 300자 이내로 입력해 주세요." }, 400);
  if (!isKarrotLink(link)) return json({ error: KARROT_LINK_HINT }, 400);
  if (raw.length < 1 || raw.length > KARROT_MAX_PHOTOS) return json({ error: `사진은 1~${KARROT_MAX_PHOTOS}장 올려 주세요.` }, 400);
  const photos: string[] = [];
  for (const r of raw) {
    const p = parseKarrotPhoto(r);
    if (!p) return json({ error: "사진 파일을 확인해 주세요." }, 400);
    photos.push(p);
  }
  try {
    await ensureSchema();
    const rows = (await db()`
      update karrot_items set title = ${title}, note = ${note}, link = ${link}, photos = ${photos}::text[]
      where id = ${b.id} and user_id = ${me}
      returning id, user_id, title, note, link, photos, created_at`) as Item[];
    if (!rows.length) return json({ error: "수정할 물품을 찾을 수 없어요." }, 404);
    return json({ item: view(rows[0], me) });
  } catch (e) {
    return fail(e);
  }
}

/** 물품 삭제(본인 것만). ?id= */
export async function DELETE(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const rows = await db()`delete from karrot_items where id = ${id} and user_id = ${me} returning id`;
    if (!rows.length) return json({ error: "삭제할 물품을 찾을 수 없어요." }, 404);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
