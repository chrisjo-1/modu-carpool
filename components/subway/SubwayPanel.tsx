"use client";
import { useEffect, useState } from "react";
import { ALL_LINES, carNumbersOf, DEFAULT_PILOT_LINES, LINE_STATIONS, type LineId, type SubwayPlan } from "@/lib/subway";
import { DOOR_NUMBERS, positionLabel } from "@/lib/subwayPosition";
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

  const lineSelect = (value: LineId, onLine: (l: LineId) => void, label: string) => (
    <label className="block text-sm text-sub">
      {label}
      <select className={`${field} mt-1`} value={value} onChange={(e) => onLine(e.target.value)}>
        {ALL_LINES.map((l) => {
          const open = pilot.includes(l.id);
          return (
            <option key={l.id} value={l.id} disabled={!open}>
              {open ? t(l.name) : `${t(l.name)} · ${t("준비 중")}`}
            </option>
          );
        })}
      </select>
    </label>
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
      <p className="rounded-2xl bg-accentSoft px-4 py-3 text-[14px] leading-relaxed text-accent">
        {t("현재 일부 노선만 테스트 준비 중입니다. 2호선·5호선부터 시작해요.")}
      </p>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{t("내 방면")}</p>
        <div className="grid grid-cols-2 gap-3">
          {lineSelect(plan.boardLine, (boardLine) => set({ boardLine, board: "", boardNext: "" }), t("탑승 노선"))}
          {stationSelect(plan.boardLine, plan.board, (board) => set({ board, boardNext: "" }), t("탑승역"))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {lineSelect(plan.alightLine, (alightLine) => set({ alightLine, alight: "", backNext: "" }), t("하차 노선"))}
          {stationSelect(plan.alightLine, plan.alight, (alight) => set({ alight, backNext: "" }), t("하차역"))}
        </div>
        <DirectionToggle line={plan.boardLine} station={plan.board} value={plan.boardNext} onChange={(boardNext) => set({ boardNext })} label={t("진행 방면 (화살표)")} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-sub">
            {t("보통 탑승 시각")}
            <input className={`${field} num mt-1`} type="time" value={plan.timeGo} onChange={(e) => set({ timeGo: e.target.value })} />
          </label>
          <label className="block text-sm text-sub">
            {t("탑승 칸")}
            <select className={`${field} mt-1`} value={plan.car} required onChange={(e) => set({ car: e.target.value })}>
              <option value="">{t("칸을 고르세요")}</option>
              {carNumbersOf(plan.boardLine).map((c) => (
                <option key={c} value={c}>{c}{t("호차")}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm text-sub">
          {t("탑승 문 번호 (선택)")}
          <select className={`${field} mt-1`} value={DOOR_NUMBERS.includes(plan.gate) ? plan.gate : ""} onChange={(e) => set({ gate: e.target.value })}>
            <option value="">{t("고르지 않음")}</option>
            {DOOR_NUMBERS.map((d) => (
              <option key={d} value={d}>{d}{t("번 문")}</option>
            ))}
          </select>
          <span className="mt-1 block text-[12px] text-sub">
            {t("승강장 바닥 삼각형 표시의 칸-문 번호예요.")}
            {positionLabel(plan.car, DOOR_NUMBERS.includes(plan.gate) ? plan.gate : "") && (
              <> {t("만날 위치")}: <span className="num font-semibold text-ink">{positionLabel(plan.car, plan.gate)}</span></>
            )}
          </span>
        </label>
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-sub">
              {t("보통 탑승 시각")}
              <input className={`${field} num mt-1`} type="time" required value={plan.timeBack} onChange={(e) => set({ timeBack: e.target.value })} />
            </label>
            <label className="block text-sm text-sub">
              {t("탑승 칸 (선택)")}
              <select className={`${field} mt-1`} value={plan.carBack} onChange={(e) => set({ carBack: e.target.value })}>
                <option value="">{t("고르지 않음")}</option>
                {carNumbersOf(plan.alightLine).map((c) => (
                  <option key={c} value={c}>{c}{t("호차")}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm text-sub">
            {t("탑승 문 번호 (선택)")}
            <select className={`${field} mt-1`} value={DOOR_NUMBERS.includes(plan.gateBack) ? plan.gateBack : ""} onChange={(e) => set({ gateBack: e.target.value })}>
              <option value="">{t("고르지 않음")}</option>
              {DOOR_NUMBERS.map((d) => (
                <option key={d} value={d}>{d}{t("번 문")}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
