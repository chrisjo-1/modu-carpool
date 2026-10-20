"use client";
import { headingsAt } from "@/lib/subwayRoute";
import { useT } from "../ui";

/**
 * 진행 방면 토글. 탑승역(또는 하차역)에서 이어지는 두 방면 중 하나를 고른다.
 * value는 다음 역 이름이고, 비어 있으면 첫 번째 방면을 보여 준다.
 */
export default function DirectionToggle({ line, station, value, onChange, label }: { line: string; station: string; value: string; onChange: (next: string) => void; label?: string }) {
  const t = useT();
  const headings = station ? headingsAt(line, station) : [];
  if (headings.length === 0) return null;
  const current = headings.some((h) => h.next === value) ? value : headings[0].next;
  return (
    <div className="space-y-1">
      <p className="text-[13px] text-sub">{label ?? t("진행 방면")}</p>
      <div role="radiogroup" aria-label={label ?? t("진행 방면")} className="flex flex-wrap gap-1.5">
        {headings.map((h) => {
          const on = current === h.next;
          return (
            <button key={h.next} type="button" role="radio" aria-checked={on} onClick={() => onChange(h.next)} className={`min-h-[40px] rounded-xl border px-3 py-1 text-left text-[13px] ${on ? "border-accent bg-white font-semibold text-accent" : "border-line bg-white text-sub"}`}>
              {h.terminal ? `${h.terminal} ${t("방면")}` : `${h.next} ${t("방향")}`}
              <span className="block text-[11px] font-normal text-sub">{t("다음역")} {h.next}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
