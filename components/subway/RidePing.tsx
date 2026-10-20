"use client";
import { useState } from "react";
import { LINE_STATIONS, type LineId } from "@/lib/subway";
import { api, field, useT } from "../ui";

/**
 * 이동 중 다시 알리기: 지금 지나는 역을 고르면 대기·수락된 상대 모두에게 푸시를 보낸다.
 * 여러 번 보낼 수 있다(횟수 제한 없음).
 */
export default function RidePing({ line, from }: { line: LineId; from: string }) {
  const t = useT();
  const stations = LINE_STATIONS[line] ?? [];
  const [station, setStation] = useState(from && stations.includes(from) ? from : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const send = async () => {
    if (!station) return setMsg(t("현재역을 골라 주세요."));
    setBusy(true);
    setMsg("");
    const r = await api<{ sent: number; station: string }>("/api/seat/ride", "POST", { station });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setMsg(r.data.sent === 0 ? t("알릴 상대가 아직 없어요.") : `${r.data.sent}${t("명에게 지금 역을 알렸어요.")}`);
  };

  return (
    <div data-block-id="C131" data-block-name="이동 중 현재역 알리기" className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <p className="text-[14px] font-semibold text-ink">{t("이동 중 현재역 알리기")}</p>
      <div className="flex gap-2">
        <select className={`${field} min-w-0 flex-1`} aria-label={t("지금 지나는 역")} value={station} onChange={(e) => setStation(e.target.value)}>
          <option value="">{t("지금 지나는 역")}</option>
          {stations.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="button" data-block-id="B253" disabled={busy} onClick={send} className="shrink-0 rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">
          {busy ? t("보내는 중…") : t("현재역 알리기")}
        </button>
      </div>
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  );
}
