import type { Metadata } from "next";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { hasDb } from "@/lib/server";
import { publishedPosts, type MarketingPost } from "@/lib/marketing";
import { SITE_URL } from "@/lib/site";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "카풀·지하철 출퇴근 가이드",
  description: "출퇴근 카풀 규칙, 지하철 앉아가는 요령, 노선별 붐비는 구간 등 모두의카풀이 정리한 출퇴근 가이드.",
  alternates: { canonical: "/guide" },
  openGraph: { title: "출퇴근 가이드 | 모두의카풀", url: "/guide" },
};

export default async function Page() {
  let list: MarketingPost[] = [];
  if (hasDb()) list = await publishedPosts().catch(() => []);
  return (
    <PublicPage blockId="S306" name="가이드 목록">
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "가이드", url: `${SITE_URL}/guide` }]} />
      <h1 className="text-[26px] font-bold leading-tight">출퇴근 가이드</h1>
      <p className="mt-3 text-sub">카풀과 지하철로 출퇴근하는 분들을 위해 모두의카풀이 정리한 글이에요.</p>
      {list.length === 0 ? (
        <p className="mt-6 text-sub">글을 준비하고 있어요. <a href="/subway" className="underline">지하철 앉아가기 안내</a>부터 보세요.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((p) => (
            <li key={p.id}>
              <a href={`/guide/${p.slug}`} className="block rounded-2xl border border-line px-4 py-4">
                <span className="block text-[17px] font-semibold">{p.title}</span>
                {p.summary && <span className="mt-1 block text-[14px] text-sub">{p.summary}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </PublicPage>
  );
}
