"use client";
import { headingsAt, nextStations } from "@/lib/subwayRoute";
import { useT } from "../ui";

/**
 * 진행 방향 토글. 탑승역에서 이어지는 두 방향 중 하나를 고른다.
 * 각 방향은 다음 세 역을 "국회의사당-여의도-샛강"처럼 이어서 보여 준다(종착역은 작은 글씨).
 * value는 다음 역 이름이고, 비어 있으면 첫 번째 방향을 보여 준다.
 */
export default function DirectionToggle({ line, station, value, onChange, label }: { line: string; station: string; value: string; onChange: (next: string) => void; label?: string }) {
  const t = useT();
  const headings = station ? headingsAt(line, station) : [];
  if (headings.length === 0) return null;
  const current = headings.some((h) => h.next === value) ? value : headings[0].next;
  return (
    <div className="space-y-1">
      <p className="text-[13px] text-sub">{label ?? t("진행 방향")}</p>
      <div role="radiogroup" aria-label={label ?? t("진행 방향")} className="grid gap-1.5">
        {headings.map((h) => {
          const on = current === h.next;
          return (
            <button key={h.next} type="button" role="radio" aria-checked={on} onClick={() => onChange(h.next)} className={`min-h-[44px] rounded-xl border px-3 py-1.5 text-left ${on ? "border-accent bg-accentSoft" : "border-line bg-white"}`}>
              <span className={`block text-[14px] ${on ? "font-semibold text-accent" : "text-ink"}`}>{nextStations(line, station, h.next, 3).join("-")}</span>
              {h.terminal && <span className="block text-[11px] text-sub">{h.terminal} {t("방면")}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
