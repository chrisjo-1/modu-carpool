import type { Metadata } from "next";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { SITE_URL } from "@/lib/site";
import { AREA_MIN_POSTS, areaCounts, areaSlug } from "@/lib/seoArea";

// 지역별 카풀 모음(네이버 SEO, 2026-11-13). 1시간마다 다시 만든다.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "지역별 출퇴근 카풀 — 서울·경기·인천",
  description: "강남구·분당구·영등포구 등 지역별로 지금 모집 중인 출퇴근 카풀을 모았어요. 같은 방향 이웃과 기름값을 나누고 함께 출근하세요.",
  alternates: { canonical: "/carpool" },
  openGraph: { title: "지역별 출퇴근 카풀 | 모두의카풀", url: "/carpool" },
};

export default async function CarpoolAreas() {
  const list = (await areaCounts().catch(() => [])).filter((a) => a.n >= AREA_MIN_POSTS);
  const groups = new Map<string, { key: string; n: number }[]>();
  for (const a of list) {
    const top = a.key.startsWith("서울") ? "서울" : a.key.startsWith("인천") ? "인천" : /시 /.test(a.key) && !a.key.startsWith("부산") ? "경기·기타" : "그 밖의 지역";
    groups.set(top, [...(groups.get(top) ?? []), a]);
  }
  return (
    <PublicPage blockId="S440" name="지역별 카풀" crumbs={[{ href: "/carpool", label: "지역별 카풀" }]}>
      <h1 className="text-[26px] font-bold leading-snug">지역별 출퇴근 카풀</h1>
      <p className="mt-2 text-sub">지금 진행 중인 카풀이 있는 지역이에요. 지역을 누르면 그 지역에서 출발하거나 도착하는 카풀을 볼 수 있어요.</p>
      {list.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-bg px-4 py-6 text-center text-sub">지금 모집 중인 카풀이 없어요.</p>
      ) : (
        [...groups.entries()].map(([g, items]) => (
          <section key={g} className="mt-8">
            <h2 className="text-[18px] font-bold">{g}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {items.map((a) => (
                <li key={a.key}>
                  <a href={`/carpool/${areaSlug(a.key)}`} className="inline-block rounded-full border border-line bg-white px-3.5 py-2 text-[14px]">
                    {a.key} 카풀 <span className="text-sub">{a.n}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "지역별 카풀", url: `${SITE_URL}/carpool` }]} />
    </PublicPage>
  );
}
