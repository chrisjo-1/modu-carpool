import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocView from "@/components/DocView";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { hasDb } from "@/lib/server";
import { postBySlug } from "@/lib/marketing";
import { SITE_URL } from "@/lib/site";

export const revalidate = 600;

async function load(slug: string) {
  if (!hasDb()) return null;
  return postBySlug(slug).catch(() => null);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: "글을 찾을 수 없어요", robots: { index: false, follow: false } };
  return {
    title: p.title,
    description: p.summary || p.body.slice(0, 120),
    keywords: p.keywords,
    alternates: { canonical: `/guide/${p.slug}` },
    openGraph: { type: "article", title: p.title, description: p.summary, url: `/guide/${p.slug}`, publishedTime: p.publishedAt ?? undefined, modifiedTime: p.updatedAt },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) notFound();
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.summary, datePublished: p.publishedAt, dateModified: p.updatedAt, author: { "@type": "Organization", name: "모두의카풀" }, publisher: { "@type": "Organization", name: "모두의카풀", logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } }, mainEntityOfPage: `${SITE_URL}/guide/${p.slug}` };
  return (
    <PublicPage blockId="S307" name="가이드 글" crumbs={[{ href: "/guide", label: "가이드" }]}>
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "가이드", url: `${SITE_URL}/guide` }, { name: p.title, url: `${SITE_URL}/guide/${p.slug}` }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <article>
        <DocView body={`# ${p.title}\n\n${p.body}`} />
        {p.publishedAt && <p className="mt-6 text-[12px] text-sub">게시 {new Date(new Date(p.publishedAt).getTime() + 9 * 3600_000).toISOString().slice(0, 10)}</p>}
      </article>
    </PublicPage>
  );
}
