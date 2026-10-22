import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { lineColor } from "@/lib/lineMeta";
import { SITE_URL } from "@/lib/site";
import { carCountOf } from "@/lib/subway";
import { hasStation, keyStations, lineName, SEO_LINES, stationProfile, SUBWAY_TIPS, type SlotPct } from "@/lib/seoSubway";

// 역 페이지는 처음 요청 때 만들고 하루 동안 재사용한다(자료가 바뀌지 않음).
export const revalidate = 86400;

/** 주요 역(검색에 내보내는 역)은 미리 만들어 둔다. 나머지 역은 처음 요청 때 만든다. */
export function generateStaticParams() {
  return SEO_LINES.flatMap((line) => keyStations(line).map((station) => ({ line, station })));
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function generateMetadata({ params }: { params: Promise<{ line: string; station: string }> }): Promise<Metadata> {
  const { line, station: raw } = await params;
  const station = decode(raw);
  if (!SEO_LINES.includes(line) || !hasStation(line, station)) return { title: "역을 찾을 수 없어요", robots: { index: false, follow: false } };
  const name = lineName(line);
  // 검색에는 출근 시간 붐비는 주요 역만 내보낸다(나머지는 링크만 따라가게).
  const indexable = keyStations(line).includes(station);
  return {
    title: `${station}역 ${name} 앉아가기 — 앉을 칸과 시간대별 혼잡도`,
    description: `${station}역 ${name} 방향별 출퇴근 시간 혼잡도와 앉을 확률이 높은 칸 3곳. 서울교통공사 혼잡도 기준, 모두의카풀 지하철 앉아가기.`,
    alternates: { canonical: `/subway/${line}/${encodeURIComponent(station)}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: `${station}역 ${name} 앉아가기 | 모두의카풀`, url: `/subway/${line}/${encodeURIComponent(station)}` },
  };
}

function Slots({ title, rows }: { title: string; rows: SlotPct[] }) {
  if (!rows.some((r) => r.pct != null)) return null;
  return (
    <div>
      <p className="text-[13px] font-semibold text-sub">{title}</p>
      <div className="mt-1 grid grid-cols-5 gap-1.5 text-center">
        {rows.map((r) => (
          <div key={r.slot} className="rounded-lg bg-bg px-1 py-2">
            <div className="text-[11px] text-sub">{r.slot}</div>
            <div className="num text-[15px] font-semibold">{r.pct == null ? "-" : `${r.pct}%`}</div>
            <div className="text-[11px] text-sub">{r.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ line: string; station: string }> }) {
  const { line, station: raw } = await params;
  const station = decode(raw);
  if (!SEO_LINES.includes(line) || !hasStation(line, station)) notFound();
  const name = lineName(line);
  const c = lineColor(line);
  const dirs = stationProfile(line, station);
  const count = carCountOf(line);
  return (
    <PublicPage blockId="S303" name="역 앉아가기 안내" crumbs={[{ href: "/subway", label: "지하철 앉아가기" }, { href: `/subway/${line}`, label: name }]}>
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "지하철 앉아가기", url: `${SITE_URL}/subway` }, { name: name, url: `${SITE_URL}/subway/${line}` }, { name: `${station}역`, url: `${SITE_URL}/subway/${line}/${encodeURIComponent(station)}` }]} />
      <h1 className="text-[24px] font-bold leading-tight">
        <span className="mr-2 inline-grid h-8 w-8 place-items-center rounded-full align-middle text-[15px]" style={{ background: c.bg, color: c.text }}>{line}</span>
        {station}역 {name} 앉아가기
      </h1>
      <p className="mt-3 text-sub">{station}역에서 방향별로 평일 출퇴근 시간 혼잡도와 앉을 확률이 높은 칸을 보여 드려요. {name}은 {count}칸 열차예요.</p>

      {dirs.map((d) => (
        <section key={d.next} className="mt-6 space-y-4 rounded-2xl border border-line p-4">
          <h2 className="text-[17px] font-bold">
            {d.ahead.join(" → ")} 방향
            {d.terminal && <span className="ml-1 text-[14px] font-normal text-sub">({d.terminal} 방면)</span>}
          </h2>
          <div>
            <p className="text-[13px] font-semibold text-sub">앉을 확률이 높은 칸 (평일 오전 8시 기준)</p>
            <ol className="mt-1 space-y-1">
              {d.cars.map((car, i) => (
                <li key={car.car} className="flex items-center justify-between rounded-lg bg-bg px-3 py-2">
                  <span><b className="num">{car.car}</b>번째 칸{i === 0 ? " · 추천" : ""}{Number(car.car) === 1 || Number(car.car) === count ? " · 맨 끝 칸(좌석 적음)" : ""}</span>
                  <span className="num font-semibold">{Math.round(car.prob * 100)}%</span>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-[12px] text-sub">{d.basis === "congestion" ? "혼잡도와 칸 위치로 계산한 추정 적중확률이에요. 이용자 착석 기록이 쌓이면 더 정확해져요." : "혼잡도 자료가 없어 칸 위치로만 추정했어요."}</p>
          </div>
          <Slots title="출근 시간 혼잡도" rows={d.am} />
          <Slots title="퇴근 시간 혼잡도" rows={d.pm} />
        </section>
      ))}

      <h2 className="mt-8 text-[18px] font-bold">앉아가는 요령</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sub">
        {SUBWAY_TIPS.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="mt-6 text-[12px] text-sub">혼잡도: 서울교통공사 시간대별 혼잡도(2026년 6월, 평일). 정원 대비 탑승 비율이며 30분 단위 평균이에요.</p>
    </PublicPage>
  );
}
