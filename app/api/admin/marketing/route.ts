import { after } from "next/server";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json, text } from "@/lib/server";
import { channelCopies, makeDraft, slugify, TEMPLATES, toPost, type TemplateKind } from "@/lib/marketing";
import { pingIndexNow } from "@/lib/indexnow";
import { keyStations, SEO_LINES } from "@/lib/seoSubway";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 마케팅 자료 목록(배포본 포함)과 초안 틀 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const rows = await db()`select * from marketing_posts order by updated_at desc limit 200`;
    const posts = rows.map(toPost).map((p) => ({ ...p, copies: channelCopies(p) }));
    return json({ posts, templates: TEMPLATES, lines: SEO_LINES });
  } catch (e) {
    return fail(e);
  }
}

/**
 * POST {action:"draft", kind, line?}: 가진 자료로 초안 만들기(같은 주소가 있으면 뒤에 번호)
 * POST {action:"ping"}: 공개 페이지 전체(가이드·지하철 안내·FAQ)를 검색엔진에 다시 알리기
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();
    if (b.action === "ping") {
      const guides = await sql`select slug from marketing_posts where status = 'published'`;
      const paths = ["/", "/faq", "/warp", "/subway", ...SEO_LINES.map((l) => `/subway/${l}`), ...SEO_LINES.flatMap((l) => keyStations(l).map((s) => `/subway/${l}/${encodeURIComponent(s)}`)), "/guide", ...guides.map((g) => `/guide/${g.slug}`)];
      const r = await pingIndexNow(paths);
      return json({ ok: r.ok, status: r.status, count: r.count });
    }
    const kind = String(b.kind) as TemplateKind;
    if (!TEMPLATES.some((t) => t.kind === kind)) return json({ error: "초안 종류를 골라 주세요." }, 400);
    const line = SEO_LINES.includes(String(b.line)) ? String(b.line) : "2";
    const d = await makeDraft(kind, line);
    let slug = d.slug;
    for (let i = 2; (await sql`select 1 from marketing_posts where slug = ${slug}`).length; i++) slug = `${d.slug}-${i}`;
    const rows = await sql`insert into marketing_posts (slug, title, summary, body, keywords) values (${slug}, ${d.title}, ${d.summary}, ${d.body}, ${d.keywords}::text[]) returning *`;
    return json({ post: toPost(rows[0]) });
  } catch (e) {
    return fail(e);
  }
}

/** 고치기 {id, slug, title, summary, body, keywords} */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const id = Number(b.id);
  const slug = slugify(text(b.slug, 80));
  const title = text(b.title, 120);
  const bodyText = typeof b.body === "string" ? b.body.slice(0, 20000) : "";
  if (!id || !slug || !title || !bodyText.trim()) return json({ error: "주소·제목·본문을 채워 주세요." }, 400);
  const keywords = Array.isArray(b.keywords) ? b.keywords.map((k) => String(k).trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [];
  try {
    await ensureSchema();
    const dup = await db()`select 1 from marketing_posts where slug = ${slug} and id <> ${id}`;
    if (dup.length) return json({ error: "같은 주소가 이미 있어요." }, 409);
    const rows = await db()`update marketing_posts set slug = ${slug}, title = ${title}, summary = ${text(b.summary, 300)}, body = ${bodyText}, keywords = ${keywords}::text[], updated_at = now() where id = ${id} returning *`;
    if (!rows.length) return json({ error: "자료를 찾을 수 없어요." }, 404);
    const p = toPost(rows[0]);
    if (p.status === "published") after(() => pingIndexNow([`/guide/${p.slug}`]).catch(() => {}));
    return json({ post: p });
  } catch (e) {
    return fail(e);
  }
}

/** 게시·내리기 {id, status: "published" | "draft"}. 게시하면 검색엔진에 바로 알린다. */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const id = Number(b.id);
  const status = b.status === "published" ? "published" : "draft";
  try {
    await ensureSchema();
    const rows = await db()`update marketing_posts set status = ${status}, published_at = case when ${status} = 'published' then coalesce(published_at, now()) else published_at end, updated_at = now() where id = ${id} returning *`;
    if (!rows.length) return json({ error: "자료를 찾을 수 없어요." }, 404);
    const p = toPost(rows[0]);
    if (status === "published") after(() => pingIndexNow([`/guide/${p.slug}`, "/guide"]).catch(() => {}));
    return json({ post: p });
  } catch (e) {
    return fail(e);
  }
}

/** 지우기 {id} */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  try {
    await ensureSchema();
    await db()`delete from marketing_posts where id = ${Number(b.id)}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
