import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { lineColor } from "@/lib/lineMeta";
import { SITE_URL } from "@/lib/site";
import { carCountOf } from "@/lib/subway";
import { busiest, hasCongestion, keyStations, lineName, SEO_LINES, stationsOf, SUBWAY_TIPS } from "@/lib/seoSubway";

export const dynamicParams = false;
export function generateStaticParams() {
  return SEO_LINES.map((line) => ({ line }));
}

export async function generateMetadata({ params }: { params: Promise<{ line: string }> }): Promise<Metadata> {
  const { line } = await params;
  const name = lineName(line);
  return {
    title: `${name} 앉아가기 — 출근 시간 혼잡한 역과 앉을 칸`,
    description: `${name} 평일 출근 시간 가장 붐비는 역과 방향, 앉을 확률이 높은 칸을 알려 드려요. ${name} ${carCountOf(line)}칸 열차 기준, 모두의카풀 지하철 앉아가기.`,
    alternates: { canonical: `/subway/${line}` },
    openGraph: { title: `${name} 앉아가기 | 모두의카풀`, url: `/subway/${line}` },
  };
}

export default async function Page({ params }: { params: Promise<{ line: string }> }) {
  const { line } = await params;
  if (!SEO_LINES.includes(line)) notFound();
  const name = lineName(line);
  const c = lineColor(line);
  const data = hasCongestion(line);
  const top = data ? busiest(line, 8) : [];
  const keys = data ? keyStations(line) : [];
  const stations = stationsOf(line);
  return (
    <PublicPage blockId="S302" name="노선 앉아가기 안내" crumbs={[{ href: "/subway", label: "지하철 앉아가기" }]}>
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "지하철 앉아가기", url: `${SITE_URL}/subway` }, { name: `${name} 앉아가기`, url: `${SITE_URL}/subway/${line}` }]} />
      <h1 className="flex items-center gap-2 text-[26px] font-bold leading-tight">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[16px]" style={{ background: c.bg, color: c.text }}>{line}</span>
        {name} 앉아가기
      </h1>
      <p className="mt-3 text-sub">
        {name}은 {carCountOf(line)}칸 열차예요.{" "}
        {data ? "평일 출근 시간에 가장 붐비는 구간과 역별 앉을 칸을 서울교통공사 시간대별 혼잡도(2026년 6월)로 정리했어요." : "이 노선은 공개 혼잡도 자료가 아직 없어, 칸 위치와 이용자 착석 기록으로 앉을 칸을 추정해요."}
      </p>

      {top.length > 0 && (
        <>
          <h2 className="mt-8 text-[18px] font-bold">출근 시간 가장 붐비는 곳</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[14px]">
              <thead className="text-sub"><tr><th className="py-2 pr-2 font-medium">역</th><th className="py-2 pr-2 font-medium">진행 방향</th><th className="py-2 pr-2 font-medium">시간</th><th className="py-2 font-medium">혼잡도</th></tr></thead>
              <tbody>
                {top.map((r) => (
                  <tr key={`${r.station}-${r.next}`} className="border-t border-line">
                    <td className="py-2 pr-2"><a href={`/subway/${line}/${encodeURIComponent(r.station)}`} className="underline-offset-2 hover:underline">{r.station}</a></td>
                    <td className="py-2 pr-2 text-sub">{r.next} 방향{r.terminal ? ` (${r.terminal} 방면)` : ""}</td>
                    <td className="py-2 pr-2 text-sub">{r.slot}</td>
                    <td className="py-2 font-semibold">{r.pct}% · {r.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-sub">혼잡도는 정원 대비 탑승 비율(평일, 30분 단위). 서울교통공사 시간대별 혼잡도 2026년 6월 자료.</p>
        </>
      )}

      {keys.length > 0 && (
        <>
          <h2 className="mt-8 text-[18px] font-bold">주요 역 앉을 칸 안내</h2>
          <p className="mt-2 flex flex-wrap gap-2">
            {keys.map((s) => (
              <a key={s} href={`/subway/${line}/${encodeURIComponent(s)}`} className="rounded-full border-2 px-3 py-1 text-[14px] font-semibold" style={{ borderColor: c.bg }}>{s}역</a>
            ))}
          </p>
        </>
      )}

      <h2 className="mt-8 text-[18px] font-bold">앉아가는 요령</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sub">
        {SUBWAY_TIPS.map((t) => <li key={t}>{t}</li>)}
      </ul>

      <h2 className="mt-8 text-[18px] font-bold">{name} 전체 역</h2>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-sub">
        {stations.map((s) => (
          <a key={s} href={`/subway/${line}/${encodeURIComponent(s)}`} className="underline-offset-2 hover:underline">{s}</a>
        ))}
      </p>
    </PublicPage>
  );
}
