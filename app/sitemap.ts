import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { db, ensureSchema, hasDb } from "@/lib/server";
import { keyStations, SEO_LINES } from "@/lib/seoSubway";

export const dynamic = "force-dynamic";

/** 정적 페이지 + 아직 유효한(출발 전·열린) 공개 카풀 글 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/warp`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/subway`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...SEO_LINES.map((l) => ({ url: `${SITE_URL}/subway/${l}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
    // 역 페이지는 출근 시간 붐비는 주요 역만(색인 대상과 같게).
    ...SEO_LINES.flatMap((l) => keyStations(l).map((s) => ({ url: `${SITE_URL}/subway/${l}/${encodeURIComponent(s)}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 }))),
  ];
  if (!hasDb()) return base;
  try {
    await ensureSchema();
    const rows = await db()`
      select p.id, p.created_at from posts p join users u on u.id = p.user_id
      where p.status = 'open' and not p.demo and not u.test and not u.blocked and (p.regular or p.depart_at > now())
      order by p.created_at desc limit 1000`;
    const guides = await db()`select slug, updated_at from marketing_posts where status = 'published'`;
    return [
      ...base,
      { url: `${SITE_URL}/guide`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 },
      ...guides.map((g) => ({ url: `${SITE_URL}/guide/${String(g.slug)}`, lastModified: new Date(g.updated_at as string), changeFrequency: "monthly" as const, priority: 0.7 })),
      ...rows.map((r) => ({ url: `${SITE_URL}/post/${String(r.id)}`, lastModified: new Date(r.created_at as string), changeFrequency: "daily" as const, priority: 0.6 })),
    ];
  } catch {
    return base;
  }
}
