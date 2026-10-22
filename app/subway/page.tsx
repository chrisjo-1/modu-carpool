import type { Metadata } from "next";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { lineColor } from "@/lib/lineMeta";
import { SITE_URL } from "@/lib/site";
import { busiest, hasCongestion, lineName, SEO_LINES, SUBWAY_TIPS } from "@/lib/seoSubway";

export const metadata: Metadata = {
  title: "지하철 앉아가기 — 노선별 앉을 칸과 출근 시간 혼잡도",
  description: "2·5·6·7·9호선 출퇴근 시간 혼잡도와 앉을 확률이 높은 칸을 노선·역별로 알려 드려요. 서울교통공사 시간대별 혼잡도 기준, 모두의카풀 지하철 앉아가기.",
  alternates: { canonical: "/subway" },
  openGraph: { title: "지하철 앉아가기 | 모두의카풀", url: "/subway" },
};

export default function Page() {
  return (
    <PublicPage blockId="S301" name="지하철 앉아가기 안내">
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "지하철 앉아가기", url: `${SITE_URL}/subway` }]} />
      <h1 className="text-[26px] font-bold leading-tight">지하철 앉아가기</h1>
      <p className="mt-3 text-sub">출근길 지하철에서 앉아 가려면 어느 칸에 서야 할까요? 서울교통공사 시간대별 혼잡도(2026년 6월)와 이용자 착석 기록으로 노선·역마다 앉을 확률이 높은 칸을 알려 드려요.</p>
      <h2 className="mt-8 text-[18px] font-bold">노선 고르기</h2>
      <ul className="mt-3 grid gap-2">
        {SEO_LINES.map((id) => {
          const c = lineColor(id);
          const top = hasCongestion(id) ? busiest(id, 1)[0] : null;
          return (
            <li key={id}>
              <a href={`/subway/${id}`} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-bold" style={{ background: c.bg, color: c.text }}>{id}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{lineName(id)} 앉아가기</span>
                  <span className="block text-[13px] text-sub">{top ? `출근 시간 가장 붐비는 곳: ${top.station} → ${top.next} ${top.pct}%` : "역별 앉을 칸 안내"}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <h2 className="mt-8 text-[18px] font-bold">앉아가는 요령</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sub">
        {SUBWAY_TIPS.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </PublicPage>
  );
}
