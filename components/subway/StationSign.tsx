"use client";
import { headingsAt } from "@/lib/subwayRoute";
import { useT } from "../ui";
import { SignBar, SignSide } from "./SignBar";

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
  return (
    <div data-block-id="C131" data-block-name="진행 방향" className="py-1.5" role="img" aria-label={`${t("진행 방향")}: ${station} → ${ahead.next}`}>
      <SignBar line={line} station={station} left={<SignSide name={ahead.next} at="left" on />} right={behind ? <SignSide name={behind.next} at="right" on={false} /> : null} />
    </div>
  );
}
