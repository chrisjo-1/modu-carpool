"use client";
import { headingsAt } from "@/lib/subwayRoute";
import { ALL_LINES, lineColor } from "@/lib/subway";
import { useT } from "../ui";

/**
 * 진행 방향 고르기 — 역 표지판 모양. 가운데에 노선 번호와 지금 역, 양쪽에 이웃 역을 두고
 * 누른 쪽이 진행 방향이 된다(고른 쪽은 진하게, 반대쪽은 흐리게).
 * 갈래가 나뉘는 역(이웃 역이 셋 이상)은 나머지 방향을 아래 칩으로 보여 준다.
 * value는 다음 역 이름이고, 비어 있으면 첫 번째 방향을 고른 것으로 본다.
 */
export default function DirectionToggle({ line, station, value, onChange, label }: { line: string; station: string; value: string; onChange: (next: string) => void; label?: string }) {
  const t = useT();
  const headings = station ? headingsAt(line, station) : [];
  if (headings.length === 0) return null;
  const current = headings.some((h) => h.next === value) ? value : headings[0].next;
  const c = lineColor(line);
  const mark = /^\d$/.test(line) ? line : (ALL_LINES.find((l) => l.id === line)?.name ?? line).slice(0, 1);
  const [left, right, ...extra] = headings;
  const picked = headings.find((h) => h.next === current) ?? headings[0];

  const side = (h: (typeof headings)[number] | undefined, at: "left" | "right") => {
    if (!h) return <span />;
    const on = h.next === current;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={`${h.next} ${t("방향")}`}
        onClick={() => onChange(h.next)}
        className={`flex min-h-[44px] min-w-0 items-center gap-1 text-[15px] ${at === "left" ? "justify-start pl-3 pr-12" : "justify-end pl-12 pr-3"} ${on ? "font-bold" : "font-medium"}`}
        style={{ color: "#FFFFFF", opacity: on ? 1 : 0.55 }}
      >
        {at === "left" && <span aria-hidden className="text-[18px] leading-none">‹</span>}
        <span className="truncate">{h.next}</span>
        {at === "right" && <span aria-hidden className="text-[18px] leading-none">›</span>}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-sub">{label ?? t("진행 방향")}</p>
      <div role="radiogroup" aria-label={label ?? t("진행 방향")} className="relative">
        {/* 표지판 띠 */}
        <div className="grid grid-cols-2 overflow-hidden rounded-full" style={{ background: c.bg }}>
          {side(left, "left")}
          {side(right, "right")}
        </div>
        {/* 가운데 지금 역 */}
        <div className="pointer-events-none absolute inset-y-[-6px] left-1/2 flex max-w-[52%] -translate-x-1/2 items-center gap-1.5 rounded-full border-[3px] bg-white px-4" style={{ borderColor: c.bg }}>
          <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold" style={{ background: c.bg, color: "#FFFFFF" }}>{mark}</span>
          <span className="truncate text-[16px] font-bold text-ink">{station}</span>
        </div>
      </div>
      {extra.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {extra.map((h) => {
            const on = h.next === current;
            return (
              <button key={h.next} type="button" role="radio" aria-checked={on} onClick={() => onChange(h.next)} className="min-h-[36px] rounded-full border-2 px-3 text-[13px] font-semibold" style={on ? { background: c.bg, borderColor: c.bg, color: "#FFFFFF" } : { background: "#FFFFFF", borderColor: c.bg, color: "#1F2937" }}>
                {h.next} {t("방향")}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[12px] text-sub">
        {picked.next} {t("방향")}
        {picked.terminal ? ` · ${picked.terminal} ${t("방면")}` : ""}
      </p>
    </div>
  );
}
