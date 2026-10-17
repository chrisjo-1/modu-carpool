"use client";
import { CAR_NUMBERS, LINES, PILOT_LINES, type LineId, type SubwayPlan } from "@/lib/subway";
import { field, useT } from "./ui";

/** 지하철 탭의 입력 화면. 탭을 눌렀을 때만 불러온다(동적 로드). 요일은 상위 시트의 값을 쓴다. */
export default function SubwayPanel({ plan, setPlan }: { plan: SubwayPlan; setPlan: (p: SubwayPlan) => void }) {
  const t = useT();
  const set = (patch: Partial<SubwayPlan>) => setPlan({ ...plan, ...patch });

  const lineSelect = (value: LineId, onLine: (l: LineId) => void, label: string) => (
    <label className="block text-sm text-sub">
      {label}
      <select className={`${field} mt-1`} value={value} onChange={(e) => onLine(e.target.value as LineId)}>
        {PILOT_LINES.map((l) => (
          <option key={l} value={l}>{LINES[l].name}</option>
        ))}
      </select>
    </label>
  );

  const stationSelect = (line: LineId, value: string, onStation: (s: string) => void, label: string) => (
    <label className="block text-sm text-sub">
      {label}
      <select className={`${field} mt-1`} value={value} required onChange={(e) => onStation(e.target.value)}>
        <option value="">{t("역을 고르세요")}</option>
        {LINES[line].stations.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4" data-block-id="S061" data-block-name="지하철 앉아가기 입력">
      <p className="rounded-2xl bg-violetSoft px-4 py-3 text-[14px] leading-relaxed text-violet">
        {t("지하철 앉아가기는 준비 중이에요. 지금 입력한 내용은 아직 저장되지 않아요.")}
      </p>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{t("출근")}</p>
        <div className="grid grid-cols-2 gap-3">
          {lineSelect(plan.boardLine, (boardLine) => set({ boardLine, board: "" }), t("탑승 노선"))}
          {stationSelect(plan.boardLine, plan.board, (board) => set({ board }), t("탑승역"))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {lineSelect(plan.alightLine, (alightLine) => set({ alightLine, alight: "" }), t("하차 노선"))}
          {stationSelect(plan.alightLine, plan.alight, (alight) => set({ alight }), t("하차역"))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-sub">
            {t("보통 탑승 시각")}
            <input className={`${field} num mt-1`} type="time" value={plan.timeGo} onChange={(e) => set({ timeGo: e.target.value })} />
          </label>
          <label className="block text-sm text-sub">
            {t("탑승 칸")}
            <select className={`${field} mt-1`} value={plan.car} required onChange={(e) => set({ car: e.target.value })}>
              <option value="">{t("칸을 고르세요")}</option>
              {CAR_NUMBERS.map((c) => (
                <option key={c} value={c}>{c}{t("호차")}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm text-sub">
          {t("탑승 입구 번호 (선택)")}
          <input className={`${field} mt-1`} maxLength={8} placeholder={t("예: 3")} value={plan.gate} onChange={(e) => set({ gate: e.target.value.slice(0, 8) })} />
        </label>
      </div>

      <label className="flex min-h-[44px] items-center gap-3 text-[15px]">
        <input type="checkbox" className="h-5 w-5 accent-[#7C3AED]" checked={plan.back} onChange={(e) => set({ back: e.target.checked })} />
        {t("퇴근도 함께 (반대 방향 자동 등록)")}
      </label>

      {plan.back && (
        <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-semibold text-ink">{t("퇴근")}</p>
          <p className="text-[14px] leading-relaxed text-sub">
            {t("퇴근 탑승역")}: <span className="font-semibold text-ink">{plan.alight || "-"}</span> · {t("퇴근 하차역")}: <span className="font-semibold text-ink">{plan.board || "-"}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-sub">
              {t("퇴근 출발 시각")}
              <input className={`${field} num mt-1`} type="time" required value={plan.timeBack} onChange={(e) => set({ timeBack: e.target.value })} />
            </label>
            <label className="block text-sm text-sub">
              {t("퇴근 탑승 칸 (선택)")}
              <select className={`${field} mt-1`} value={plan.carBack} onChange={(e) => set({ carBack: e.target.value })}>
                <option value="">{t("고르지 않음")}</option>
                {CAR_NUMBERS.map((c) => (
                  <option key={c} value={c}>{c}{t("호차")}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm text-sub">
            {t("퇴근 입구 번호 (선택)")}
            <input className={`${field} mt-1`} maxLength={8} value={plan.gateBack} onChange={(e) => set({ gateBack: e.target.value.slice(0, 8) })} />
          </label>
        </div>
      )}
    </div>
  );
}
