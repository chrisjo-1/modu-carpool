"use client";
import { headingsAt } from "@/lib/subwayRoute";
import { ALL_LINES, lineColor } from "@/lib/subway";
import { useT } from "../ui";

/**
 * 역 표지판 그림(보기 전용). 자리 그림처럼 열차 앞쪽이 왼쪽이므로
 * 왼쪽에 다음 역(진행 방향, 진하게), 가운데에 지금 역, 오른쪽에 지나온 역(흐리게)을 둔다.
 */
export default function StationSign({ line, station, next }: { line: string; station: string; next?: string }) {
  const t = useT();
  const hs = station ? headingsAt(line, station) : [];
  if (!hs.length) return null;
  const ahead = hs.find((h) => h.next === next) ?? hs[0];
  const behind = hs.find((h) => h.next !== ahead.next);
  const c = lineColor(line);
  const mark = /^\d$/.test(line) ? line : (ALL_LINES.find((l) => l.id === line)?.name ?? line).slice(0, 1);
  return (
    <div data-block-id="C131" data-block-name="진행 방향" className="relative py-1.5" role="img" aria-label={`${t("진행 방향")}: ${station} → ${ahead.next}`}>
      <div className="grid grid-cols-2 overflow-hidden rounded-full text-[14px] text-white" style={{ background: c.bg }}>
        <span className="flex min-h-[38px] min-w-0 items-center gap-1 pl-3 pr-12 font-bold">
          <span aria-hidden className="text-[18px] leading-none">‹</span>
          <span className="truncate">{ahead.next}</span>
        </span>
        <span className="flex min-h-[38px] min-w-0 items-center justify-end pl-12 pr-3 font-medium" style={{ opacity: 0.6 }}>
          <span className="truncate">{behind?.next ?? ""}</span>
        </span>
      </div>
      <div className="absolute inset-y-0 left-1/2 flex max-w-[52%] -translate-x-1/2 items-center gap-1.5 rounded-full border-[3px] bg-white px-3.5" style={{ borderColor: c.bg }}>
        <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: c.bg }}>{mark}</span>
        <span className="truncate text-[15px] font-bold text-ink">{station}</span>
      </div>
    </div>
  );
}
