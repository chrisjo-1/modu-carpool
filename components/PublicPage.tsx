import type { ReactNode } from "react";

/** 로그인 없이 보는 공개 안내 페이지 틀(지하철 안내·FAQ·워프 안내). 밝은 바탕, 상단 홈 링크, 하단 가입 안내. */
export default function PublicPage({ blockId, name, crumbs, children }: { blockId: string; name: string; crumbs?: { href: string; label: string }[]; children: ReactNode }) {
  return (
    <main data-block-id={blockId} data-block-name={name} className="mx-auto min-h-[var(--vh100)] max-w-2xl bg-white px-5 pb-16 pt-6 text-[15px] leading-relaxed text-ink">
      <nav aria-label="경로" className="mb-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px]">
        <a href="/" className="font-semibold text-accent">← 모두의카풀</a>
        {crumbs?.map((c) => (
          <span key={c.href} className="text-sub">
            / <a href={c.href} className="underline-offset-2 hover:underline">{c.label}</a>
          </span>
        ))}
      </nav>
      {children}
      <aside className="mt-10 space-y-3 rounded-2xl bg-accentSoft px-5 py-5">
        <p className="text-[16px] font-bold text-ink">모두의카풀에서 같은 방향 사람과 함께 가요</p>
        <p className="text-[14px] text-sub">출퇴근 카풀과 지하철 앉아가기를 무료로 이용할 수 있어요. 지하철 정보를 등록하면 지금 시간에 맞춰 앉을 칸을 알려 드려요.</p>
        <a href="/" className="inline-block rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-white">모두의카풀 시작하기</a>
      </aside>
    </main>
  );
}

/** 이동 경로 구조화 데이터(검색 결과의 경로 표시). */
export function BreadcrumbLd({ items }: { items: { name: string; url: string }[] }) {
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })) };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />;
}
