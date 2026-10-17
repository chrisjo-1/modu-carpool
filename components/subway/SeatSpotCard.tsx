"use client";
import { useEffect, useState } from "react";
import { carNumbersOf, type LineId } from "@/lib/subway";
import { DOOR_NUMBERS } from "@/lib/subwayPosition";
import { api, field, useT } from "../ui";
import { spotText } from "./SubwayMatches";

type Spot = { car: string; door: string; side: "left" | "right" | ""; memo: string };

/**
 * 오늘 앉은 자리 위치(칸-문·왼쪽/오른쪽·메모). 수락된 상대에게만 보이고, 입력하면 상대에게 알린다.
 * 하루만 쓰고 다음 날에는 다시 입력한다.
 */
export default function SeatSpotCard({ line }: { line: LineId }) {
  const t = useT();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [edit, setEdit] = useState(false);
  const [car, setCar] = useState("");
  const [door, setDoor] = useState("");
  const [side, setSide] = useState<Spot["side"]>("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<{ spot: Spot | null }>("/api/seat/spot").then((r) => {
      setLoaded(true);
      if (r.ok && r.data.spot) setSpot(r.data.spot);
    });
  }, []);

  const startEdit = () => {
    setCar(spot?.car ?? "");
    setDoor(spot?.door ?? "");
    setSide(spot?.side ?? "");
    setMemo(spot?.memo ?? "");
    setMsg("");
    setEdit(true);
  };

  const save = async () => {
    if (!car || !door) return setMsg(t("칸과 문 번호를 먼저 골라 주세요."));
    setBusy(true);
    const r = await api<{ spot: Spot }>("/api/seat/spot", "PUT", { car, door, side, memo });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setSpot(r.data.spot);
    setEdit(false);
    setMsg(t("저장했어요. 매칭된 상대에게 알렸어요."));
  };

  const clear = async () => {
    setBusy(true);
    const r = await api("/api/seat/spot", "DELETE");
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setSpot(null);
    setMsg("");
  };

  if (!loaded) return <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4" data-block-id="S073" data-block-name="내 자리 위치">
      {!edit && spot && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-sub">{t("오늘 내 자리")}</p>
            <p className="num text-[18px] font-semibold text-ink">{spotText(spot)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="rounded-xl bg-bg px-3 py-2 text-[14px] font-semibold text-ink" onClick={startEdit}>{t("수정")}</button>
            <button type="button" className="rounded-xl bg-bg px-3 py-2 text-[14px] text-sub" disabled={busy} onClick={clear}>{t("지우기")}</button>
          </div>
        </div>
      )}
      {!edit && !spot && (
        <div className="space-y-2">
          <p className="text-[14px] leading-relaxed text-sub">{t("자리에 앉았다면 위치를 알려 주세요. 매칭된 상대에게만 보여요.")}</p>
          <button type="button" className="w-full rounded-xl bg-violet py-3 text-[15px] font-semibold text-white" onClick={startEdit}>{t("자리 위치 입력")}</button>
        </div>
      )}
      {edit && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-sub">
              {t("칸")}
              <select className={`${field} mt-1`} value={car} onChange={(e) => setCar(e.target.value)}>
                <option value="">{t("고르세요")}</option>
                {carNumbersOf(line).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-sub">
              {t("문")}
              <select className={`${field} mt-1`} value={door} onChange={(e) => setDoor(e.target.value)}>
                <option value="">{t("고르세요")}</option>
                {DOOR_NUMBERS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <p className="text-sm text-sub">{t("문 기준")}</p>
            <div role="radiogroup" className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
              {(["left", "right"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(side === s ? "" : s)} className={`min-h-[40px] rounded-lg text-[14px] font-medium ${side === s ? "bg-white text-ink shadow-sm" : "text-sub"}`}>
                  {s === "left" ? t("왼쪽") : t("오른쪽")}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm text-sub">
            {t("메모 (선택)")}
            <input className={`${field} mt-1`} maxLength={40} placeholder={t("예: 검은 모자, 끝자리")} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-xl bg-violet py-3 text-[15px] font-semibold text-white disabled:opacity-40" disabled={busy} onClick={save}>{t("저장")}</button>
            <button type="button" className="rounded-xl bg-bg px-4 py-3 text-[15px] text-sub" onClick={() => setEdit(false)}>{t("취소")}</button>
          </div>
        </div>
      )}
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  );
}
