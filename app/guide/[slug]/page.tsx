import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { getPublishedSeoPage, listPublishedSeoPages } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

/**
 * 키워드 안내 페이지(관리자 'SEO 키워드' 탭에서 만들고 공개, 2026-11-22).
 * 10분마다 다시 만들고, 관리자가 저장하면 바로 새로 만든다(revalidatePath). 숨긴 글은 404.
 */
export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublishedSeoPage((await params).slug);
  if (!p) return { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };
  return {
    title: { absolute: p.title },
    description: p.description,
    keywords: [p.keyword, "모두의카풀", "카풀"],
    alternates: { canonical: `/guide/${p.slug}` },
    openGraph: { title: p.title, description: p.description, url: `/guide/${p.slug}`, type: "article", images: [{ url: "/og-v2.png", width: 1200, height: 630 }] },
  };
}

/** 본문: 빈 줄·줄바꿈으로 문단, '## '로 시작하면 소제목, '- '로 시작하면 목록 */
function Body({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    out.push(
      <ul key={`l${out.length}`} className="mt-3 list-disc space-y-1.5 pl-5 text-sub">
        {list.map((x, i) => <li key={i}>{x}</li>)}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("- ")) { list.push(line.slice(2)); continue; }
    flush();
    if (line.startsWith("## ")) out.push(<h2 key={`h${out.length}`} className="mt-8 text-[18px] font-bold">{line.slice(3)}</h2>);
    else out.push(<p key={`p${out.length}`} className="mt-3 text-sub">{line}</p>);
  }
  flush();
  return <>{out}</>;
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getPublishedSeoPage((await params).slug);
  if (!p) notFound();
  const others = (await listPublishedSeoPages()).filter((x) => x.slug !== p.slug).slice(0, 8);
  const faqLd = p.faq.length
    ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
    : null;
  return (
    <PublicPage blockId="S307" name="키워드 안내" crumbs={[{ href: `/guide/${p.slug}`, label: p.keyword || p.h1 }]}>
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: p.keyword || p.h1, url: `${SITE_URL}/guide/${p.slug}` }]} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }} />}
      <h1 className="text-[26px] font-bold leading-tight">{p.h1 || p.title}</h1>
      <Body text={p.body} />
      <p className="mt-6">
        <a href="/" className="inline-block rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-white">지금 열린 카풀 보기</a>
      </p>
      {p.faq.length > 0 && (
        <>
          <h2 className="mt-8 text-[18px] font-bold">자주 묻는 질문</h2>
          <dl className="mt-3 space-y-4">
            {p.faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1 text-sub">{f.a}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <p className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-[14px]">
        <a href="/carpool-app" className="underline">카풀 앱 안내</a>
        <a href="/carpool" className="underline">지역별 카풀</a>
        {others.map((o) => (
          <a key={o.slug} href={`/guide/${o.slug}`} className="underline">{o.keyword}</a>
        ))}
      </p>
    </PublicPage>
  );
}
