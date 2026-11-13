import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { SITE_URL } from "@/lib/site";
import { AREA_MIN_POSTS, areaKey, areaSlug, costText, openPosts, roleWord, routeTitle, shortArea, slugArea, whenText } from "@/lib/seoArea";

// 구 단위 카풀 모음(네이버 SEO, 2026-11-13). 1시간마다 다시 만든다. 글이 3건 미만이면 검색에 올리지 않는다.
export const revalidate = 3600;
// 미리 만들어 두는 페이지는 없고, 처음 열릴 때 만든 뒤 위 주기마다 갱신(ISR)
export async function generateStaticParams() {
  return [];
}

const clean = (s: string) => (/^[가-힣A-Za-z0-9 ]{2,30}$/.test(s) && s.includes(" ") ? s : "");

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }): Promise<Metadata> {
  const key = clean(slugArea((await params).area));
  if (!key) return { title: "지역을 찾을 수 없어요", robots: { index: false, follow: false } };
  const posts = await openPosts({ area: key, limit: 60 }).catch(() => []);
  const short = shortArea(key);
  const title = `${key} 출퇴근 카풀 — ${short} 카풀 ${posts.length}건`;
  const description = `${key}에서 출발하거나 도착하는 출퇴근 카풀 ${posts.length}건. ${short} 같은 방향 이웃과 기름값을 나누고 함께 출근하세요. 무료 운행·실비 분담.`;
  return {
    title,
    description,
    alternates: { canonical: `/carpool/${areaSlug(key)}` },
    robots: posts.length >= AREA_MIN_POSTS ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: `${title} | 모두의카풀`, description, url: `/carpool/${areaSlug(key)}` },
  };
}

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const key = clean(slugArea((await params).area));
  if (!key) notFound();
  const posts = await openPosts({ area: key, limit: 60 }).catch(() => []);
  const short = shortArea(key);
  const from = posts.filter((p) => areaKey(p.originArea) === key);
  const to = posts.filter((p) => areaKey(p.originArea) !== key);
  const drivers = posts.filter((p) => p.role === "driver").length;
  const List = ({ items }: { items: typeof posts }) => (
    <ul className="mt-3 space-y-2">
      {items.map((p) => (
        <li key={p.id}>
          <a href={`/post/${p.id}`} className="block rounded-2xl border border-line bg-white px-4 py-3">
            <span className="text-[12px] font-semibold text-sub">{roleWord(p.role)} · {p.regular ? "정기카풀" : "1회"}</span>
            <span className="block text-[16px] font-semibold">{p.origin} → {p.dest}</span>
            <span className="block text-[13px] text-sub">{routeTitle(p)} · {whenText(p)} · {costText(p)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <PublicPage blockId="S441" name="구 카풀" crumbs={[{ href: "/carpool", label: "지역별 카풀" }, { href: `/carpool/${areaSlug(key)}`, label: key }]}>
      <h1 className="text-[26px] font-bold leading-snug">{key} 출퇴근 카풀</h1>
      <p className="mt-2 text-sub">
        {posts.length > 0
          ? `${short}에서 출발하거나 ${short}(으)로 가는 카풀 ${posts.length}건이 진행 중이에요(운전자 ${drivers}건 · 탑승자 ${posts.length - drivers}건). 같은 방향 이웃과 기름값을 나누고 함께 출근하세요.`
          : `${short}에서 지금 모집 중인 카풀이 없어요. 출퇴근 경로를 먼저 올려 두면 같은 길 이웃이 생길 때 알려 드려요.`}
      </p>
      {from.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{short}에서 출발하는 카풀</h2>
          <List items={from} />
        </section>
      )}
      {to.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{short}(으)로 가는 카풀</h2>
          <List items={to} />
        </section>
      )}
      <p className="mt-8 text-[13px] text-sub">모두의카풀은 무료 운행과 실비 분담(평일 출퇴근 시간)을 원칙으로 해요. 연락처는 신청이 수락된 뒤에만 서로 공개돼요. <a href="/carpool" className="underline">다른 지역 보기</a></p>
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "지역별 카풀", url: `${SITE_URL}/carpool` }, { name: key, url: `${SITE_URL}/carpool/${areaSlug(key)}` }]} />
    </PublicPage>
  );
}
