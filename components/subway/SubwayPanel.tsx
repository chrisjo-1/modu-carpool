"use client";
import { useEffect, useState } from "react";
import { ALL_LINES, DEFAULT_PILOT_LINES, LINE_STATIONS, lineColor, linesLabel, type LineId, type SubwayPlan } from "@/lib/subway";
import { field, useT } from "../ui";
import DirectionToggle from "./DirectionToggle";

/** 지하철 탭의 입력 화면. 탭을 열었을 때만 불러온다(동적 로드). 요일은 상위 시트의 값을 쓴다. */
export default function SubwayPanel({ plan, setPlan, onPilot }: { plan: SubwayPlan; setPlan: (p: SubwayPlan) => void; onPilot?: (p: LineId[]) => void; days?: string }) {
  const t = useT();
  const [pilot, setPilot] = useState<LineId[]>(DEFAULT_PILOT_LINES);
  const set = (patch: Partial<SubwayPlan>) => setPlan({ ...plan, ...patch });

  // 시범 노선은 관리자 설정을 따른다. 불러오지 못하면 기본값을 쓴다.
  useEffect(() => {
    fetch("/api/seat/config")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.pilot) && j.pilot.length) {
          setPilot(j.pilot);
          onPilot?.(j.pilot);
        }
      })
      .catch(() => {});
  }, [onPilot]);

  // 노선은 열린 노선만 고유색 칩으로 고른다(선택한 칩은 노선색으로 채운다).
  const lineSelect = (value: LineId, onLine: (l: LineId) => void, label: string) => (
    <div className="text-sm text-sub">
      {label}
      <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {ALL_LINES.filter((l) => pilot.includes(l.id)).map((l) => {
          const on = value === l.id;
          const c = lineColor(l.id);
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onLine(l.id)}
              className="min-h-[40px] rounded-full border-2 px-3 text-[14px] font-semibold"
              style={on ? { background: c.bg, borderColor: c.bg, color: c.text } : { background: "#FFFFFF", borderColor: c.bg, color: "#1F2937" }}
            >
              {t(l.name)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const stationSelect = (line: LineId, value: string, onStation: (s: string) => void, label: string) => (
    <label className="block text-sm text-sub">
      {label}
      <select className={`${field} mt-1`} value={value} required onChange={(e) => onStation(e.target.value)}>
        <option value="">{t("역을 고르세요")}</option>
        {(LINE_STATIONS[line] ?? []).map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4" data-block-id="S061" data-block-name="지하철 앉아가기 입력">
      <p className="rounded-2xl bg-violetSoft px-4 py-3 text-[14px] leading-relaxed text-violet">
        {t("지금 이용할 수 있는 노선")}: {linesLabel(pilot)}
      </p>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{t("내 방면")}</p>
        {lineSelect(plan.boardLine, (boardLine) => set({ boardLine, board: "", boardNext: "" }), t("탑승 노선"))}
        {stationSelect(plan.boardLine, plan.board, (board) => set({ board, boardNext: "" }), t("탑승역"))}
        {lineSelect(plan.alightLine, (alightLine) => set({ alightLine, alight: "", backNext: "" }), t("하차 노선"))}
        {stationSelect(plan.alightLine, plan.alight, (alight) => set({ alight, backNext: "" }), t("하차역"))}
        <DirectionToggle line={plan.boardLine} station={plan.board} value={plan.boardNext} onChange={(boardNext) => set({ boardNext })} label={t("진행 방면 (화살표)")} />
      </div>


      <label className="flex min-h-[44px] items-center gap-3 text-[15px]">
        <input type="checkbox" className="h-5 w-5 accent-[#7C3AED]" checked={plan.back} onChange={(e) => set({ back: e.target.checked })} />
        {t("반대 방면도 함께 등록")}
      </label>

      {plan.back && (
        <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-semibold text-ink">{t("반대 방면")}</p>
          <p className="text-[14px] leading-relaxed text-sub">
            {t("탑승역")}: <span className="font-semibold text-ink">{plan.alight || "-"}</span> · {t("하차역")}: <span className="font-semibold text-ink">{plan.board || "-"}</span>
          </p>
          <DirectionToggle line={plan.alightLine} station={plan.alight} value={plan.backNext} onChange={(backNext) => set({ backNext })} label={t("진행 방면 (화살표)")} />
        </div>
      )}
    </div>
  );
}
