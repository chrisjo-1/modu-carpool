"use client";
import { headingsAt } from "@/lib/subwayRoute";
import { lineColor } from "@/lib/subway";
import { SignBar, SignSide } from "./SignBar";
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
  const [left, right, ...extra] = headings;
  const picked = headings.find((h) => h.next === current) ?? headings[0];

  const side = (h: (typeof headings)[number] | undefined, at: "left" | "right") => {
    if (!h) return null;
    const on = h.next === current;
    return (
      <button type="button" role="radio" aria-checked={on} aria-label={`${h.next} ${t("방향")}`} onClick={() => onChange(h.next)} className="w-full min-w-0">
        <SignSide name={h.next} at={at} on={on} />
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-sub">{label ?? t("진행 방향")}</p>
      <div role="radiogroup" aria-label={label ?? t("진행 방향")} className="py-1.5">
        <SignBar line={line} station={station} left={side(left, "left")} right={side(right, "right")} />
      </div>
      {extra.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {extra.map((h) => {
            const on = h.next === current;
            return (
              <button key={h.next} type="button" role="radio" aria-checked={on} onClick={() => onChange(h.next)} className="min-h-[36px] rounded-full border-2 px-3 text-[13px] font-semibold" style={on ? { background: c.bg, borderColor: c.bg, color: c.text } : { background: "#FFFFFF", borderColor: c.bg, color: "#1F2937" }}>
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
