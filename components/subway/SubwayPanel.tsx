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

  // 환승: 탑승 노선에 있으면서 다른 열린 노선에도 있는 역만 환승역 후보(2026-11-23 사용자 지시 '환승역이 있으면 추가')
  const boardStations = LINE_STATIONS[plan.boardLine] ?? [];
  const otherLines = ALL_LINES.filter((l) => pilot.includes(l.id) && l.id !== plan.boardLine);
  const transferable = boardStations.filter((st) => otherLines.some((l) => (LINE_STATIONS[l.id] ?? []).includes(st)));
  const transferLines = plan.transfer ? otherLines.filter((l) => (LINE_STATIONS[l.id] ?? []).includes(plan.transfer)).map((l) => l.id) : [];
  const [transferOpen, setTransferOpen] = useState(false);
  const transferOn = transferOpen || plan.boardLine !== plan.alightLine || !!plan.transfer;
  const offTransfer = () => {
    setTransferOpen(false);
    const keep = boardStations.includes(plan.alight) ? plan.alight : "";
    set({ transfer: "", alightLine: plan.boardLine, alight: keep, backNext: keep === plan.alight ? plan.backNext : "" });
  };
  const use: "go" | "back" | "both" = plan.go === false ? "back" : plan.back ? "both" : "go";
  const setUse = (u: "go" | "back" | "both") => set({ go: u !== "back", back: u !== "go" });

  return (
    <div className="space-y-4" data-block-id="S061" data-block-name="지하철 앉아가기 입력">
      <p className="rounded-2xl bg-lcSoft px-4 py-3 text-[14px] leading-relaxed text-brand">
        {t("지금 이용할 수 있는 노선")}: {linesLabel(pilot)}
      </p>

      <div className="space-y-3">
        {/* 노선은 한 번만 고르고 출근·퇴근 승차역을 나란히(2026-11-23 사용자 지시) */}
        {lineSelect(plan.boardLine, (boardLine) => {
          setTransferOpen(false);
          set({ boardLine, alightLine: boardLine, board: "", alight: "", transfer: "", boardNext: "", backNext: "" });
        }, t("노선"))}
        <div className="grid grid-cols-2 gap-3">
          {stationSelect(plan.boardLine, plan.board, (board) => set({ board, boardNext: "" }), t("출근 승차역"))}
          {stationSelect(plan.alightLine, plan.alight, (alight) => set({ alight, backNext: "" }), plan.alightLine !== plan.boardLine ? `${t("퇴근 승차역")} (${t(ALL_LINES.find((l) => l.id === plan.alightLine)?.name ?? "")})` : t("퇴근 승차역"))}
        </div>
        <p className="text-[12px] leading-relaxed text-sub">{t("퇴근 승차역은 출근할 때 내리는 역이에요.")}</p>

        {!transferOn ? (
          transferable.length > 0 && (
            <button type="button" data-block-id="B520" data-block-name="환승역 추가" className="min-h-[40px] text-[14px] font-semibold text-brand" onClick={() => setTransferOpen(true)}>
              + {t("환승역 추가")}
            </button>
          )
        ) : (
          <div data-block-id="C458" data-block-name="환승역" className="space-y-2 rounded-2xl border border-line bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{t("환승")}</p>
              <button type="button" className="min-h-0 py-1 text-[13px] text-sub underline" onClick={offTransfer}>{t("환승 빼기")}</button>
            </div>
            <label className="block text-sm text-sub">
              {t("환승역")}
              <select className={`${field} mt-1`} value={plan.transfer} onChange={(e) => {
                const transfer = e.target.value;
                const lines = otherLines.filter((l) => (LINE_STATIONS[l.id] ?? []).includes(transfer)).map((l) => l.id);
                const alightLine = lines.includes(plan.alightLine) ? plan.alightLine : lines[0] ?? plan.boardLine;
                set({ transfer, alightLine, alight: alightLine === plan.alightLine ? plan.alight : "", backNext: alightLine === plan.alightLine ? plan.backNext : "" });
              }}>
                <option value="">{t("역을 고르세요")}</option>
                {transferable.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </label>
            {transferLines.length > 1 && lineSelect(plan.alightLine, (alightLine) => set({ alightLine, alight: "", backNext: "" }), t("갈아탈 노선"))}
            {plan.transfer && transferLines.length === 1 && (
              <p className="text-[13px] text-sub">{plan.transfer}{t("에서")} {t(ALL_LINES.find((l) => l.id === plan.alightLine)?.name ?? "")}{t("으로 갈아타요")}</p>
            )}
            <p className="text-[12px] text-sub">{t("자리 매칭은 환승역까지 같은 노선 구간으로 찾아요.")}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={`block text-sm text-sub ${use === "back" ? "opacity-50" : ""}`}>
            {t("출근 승차 시간")}
            <input className={`${field} num mt-1`} type="time" value={plan.timeGo} onChange={(e) => set({ timeGo: e.target.value })} />
          </label>
          <label className={`block text-sm text-sub ${use === "go" ? "opacity-50" : ""}`}>
            {t("퇴근 승차 시간")}
            <input className={`${field} num mt-1`} type="time" value={plan.timeBack} onChange={(e) => set({ timeBack: e.target.value })} />
          </label>
        </div>

        {use !== "back" && <DirectionToggle line={plan.boardLine} station={plan.board} value={plan.boardNext} onChange={(boardNext) => set({ boardNext })} label={t("출근 진행 방면 (화살표)")} />}
        {use !== "go" && <DirectionToggle line={plan.alightLine} station={plan.alight} value={plan.backNext} onChange={(backNext) => set({ backNext })} label={t("퇴근 진행 방면 (화살표)")} />}
      </div>

      {/* 마지막에 출근·퇴근·둘 다 중 선택(2026-11-23 사용자 지시) */}
      <div className="space-y-1.5" data-block-id="F460" data-block-name="출근·퇴근·둘 다">
        <p className="text-sm font-semibold text-ink">{t("어느 때 이용하나요?")}</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("어느 때 이용하나요?")}>
          {([["go", "출근"], ["back", "퇴근"], ["both", "둘 다"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={use === k} onClick={() => setUse(k)}
              className={`min-h-[44px] rounded-xl border-2 text-[15px] font-semibold ${use === k ? "border-brand bg-brand text-white" : "border-line bg-white text-ink"}`}>
              {t(label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
