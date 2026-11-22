import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { pingIndexNow } from "@/lib/indexnow";
import { logOps } from "@/lib/opsLog";
import { DESC_MAX, FIXED_PAGES, SEO_TAG, SLUG_RE, TITLE_MAX, cleanHome, listSeoPagesRaw, readHomeRaw } from "@/lib/seo";
import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 관리자 'SEO 키워드' 탭(2026-11-22).
 * GET  : 홈 제목·설명·키워드 + 키워드 안내 페이지 목록 + 기존(코드) 페이지
 * PUT  : 홈 저장 {title, description, keywords[]}
 * POST : 키워드 페이지 저장 {slug, keyword, title, description, h1, body, faq[{q,a}], published}
 * DELETE ?slug= : 키워드 페이지 삭제
 */
function refresh(paths: string[]) {
  revalidateTag(SEO_TAG);
  for (const p of paths) revalidatePath(p);
  revalidatePath("/sitemap.xml");
}

export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    const [home, pages] = await Promise.all([readHomeRaw(), listSeoPagesRaw()]);
    return json({ home, pages, fixed: FIXED_PAGES, limits: { title: TITLE_MAX, description: DESC_MAX } });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const b = await body(req);
    const home = cleanHome(b);
    await db()`insert into settings (key, value) values ('seo_home', ${JSON.stringify(home)})
      on conflict (key) do update set value = excluded.value`;
    refresh(["/"]);
    after(() => pingIndexNow(["/"]).then(() => {}).catch(() => {}));
    await logOps("admin", "SEO 홈 제목·설명 저장", home.title).catch(() => {});
    return json({ ok: true, home });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const b = await body(req);
    const slug = String(b.slug ?? "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return json({ error: "주소는 영문 소문자·숫자·-(하이픈)로 2~49자예요. 예: commute-carpool" }, 400);
    const keyword = String(b.keyword ?? "").trim().slice(0, 40);
    const title = String(b.title ?? "").trim().slice(0, 80);
    const description = String(b.description ?? "").trim().slice(0, 200);
    const h1 = String(b.h1 ?? "").trim().slice(0, 80);
    const text = String(b.body ?? "").replace(/\r/g, "").slice(0, 8000);
    const faq = (Array.isArray(b.faq) ? b.faq : [])
      .map((f: { q?: unknown; a?: unknown }) => ({ q: String(f?.q ?? "").trim().slice(0, 120), a: String(f?.a ?? "").trim().slice(0, 600) }))
      .filter((f: { q: string; a: string }) => f.q && f.a)
      .slice(0, 10);
    const published = !!b.published;
    if (!keyword || !title) return json({ error: "키워드와 제목은 꼭 적어 주세요." }, 400);
    if (published && text.trim().length < 200) return json({ error: "공개하려면 본문을 200자 넘게 적어 주세요(검색엔진이 얇은 페이지로 봐요)." }, 400);
    const prev = await db()`select published from seo_pages where slug = ${slug}`;
    await db()`insert into seo_pages (slug, keyword, title, description, h1, body, faq, published, published_at, updated_at)
      values (${slug}, ${keyword}, ${title}, ${description}, ${h1}, ${text}, ${JSON.stringify(faq)}::jsonb, ${published}, ${published ? new Date().toISOString() : null}, now())
      on conflict (slug) do update set keyword = excluded.keyword, title = excluded.title, description = excluded.description,
        h1 = excluded.h1, body = excluded.body, faq = excluded.faq, published = excluded.published,
        published_at = case when excluded.published then coalesce(seo_pages.published_at, now()) else seo_pages.published_at end,
        updated_at = now()`;
    refresh([`/guide/${slug}`]);
    // 새로 공개했거나 공개 중인 글을 고치면 네이버·빙에 알림
    if (published) after(() => pingIndexNow([`/guide/${slug}`, "/sitemap.xml"]).then(() => {}).catch(() => {}));
    const was = prev.length ? !!prev[0].published : false;
    await logOps("admin", published && !was ? "SEO 키워드 페이지 공개" : "SEO 키워드 페이지 저장", `${keyword} /guide/${slug}`).catch(() => {});
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    if (!SLUG_RE.test(slug)) return json({ error: "주소가 올바르지 않아요." }, 400);
    await db()`delete from seo_pages where slug = ${slug}`;
    refresh([`/guide/${slug}`]);
    await logOps("admin", "SEO 키워드 페이지 삭제", `/guide/${slug}`).catch(() => {});
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
