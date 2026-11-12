"use client";
import { useEffect, useState } from "react";
import type { LineId } from "@/lib/subway";
import { api, useT } from "../ui";

type Train = { trainNo: string; terminal: string; msg: string; code: number; sec: number; express: boolean; last: boolean };
type Mine = { line: string; trainNo: string; terminal: string; station: string } | null;
type Resp = { supported: boolean; trains: Train[]; mine: Mine; same: number };

/**
 * 내가 탄 열차 고르기(선택, 2026-11-12). 서울시 실시간 도착정보로 내 역에 들어오거나 막 떠난 열차를 보여 주고,
 * 고르면 오늘 열차번호를 남겨 같은 열차에 탄 회원과 먼저 매칭한다. 실시간 정보가 없는 노선이면 숨긴다.
 */
export default function TrainPick({ line, station, next }: { line: LineId; station: string; next?: string }) {
  const t = useT();
  const [data, setData] = useState<Resp | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const q = `/api/seat/train?line=${encodeURIComponent(line)}&board=${encodeURIComponent(station)}&next=${encodeURIComponent(next ?? "")}`;

  // 처음엔 오늘 고른 열차만 확인(실시간 호출은 [열차 불러오기]를 누를 때)
  useEffect(() => {
    let alive = true;
    api<Resp>(`/api/seat/train?line=${encodeURIComponent(line)}`).then((r) => {
      if (alive && r.ok) setData({ ...r.data, trains: [] });
    });
    return () => {
      alive = false;
    };
  }, [line]);

  const load = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<Resp>(q);
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setData(r.data);
    setOpen(true);
    if (!r.data.trains.length) setMsg(t("지금 들어오는 열차 정보가 없어요. 잠시 뒤 다시 눌러 주세요."));
  };

  const pick = async (tr: Train) => {
    setBusy(true);
    const r = await api<{ mine: Mine; same: number }>("/api/seat/train", "POST", { line, trainNo: tr.trainNo, terminal: tr.terminal, station });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setData((d) => (d ? { ...d, mine: r.data.mine, same: r.data.same } : d));
    setOpen(false);
    setMsg("");
  };

  const clear = async () => {
    setBusy(true);
    await api("/api/seat/train", "DELETE");
    setBusy(false);
    setData((d) => (d ? { ...d, mine: null, same: 0 } : d));
  };

  if (!data || !data.supported) return null;
  const mine = data.mine && data.mine.line === line ? data.mine : null;
  const when = (x: Train) => (x.code === 2 ? t("막 출발") : x.code === 1 ? t("도착") : x.code === 0 ? t("진입 중") : x.sec > 0 ? `${Math.max(1, Math.round(x.sec / 60))}${t("분 후")}` : x.msg);

  return (
    <div data-block-id="C441" data-block-name="내가 탄 열차" className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">{t("내가 탄 열차 (선택)")}</p>
        {mine && (
          <button type="button" data-block-id="B498" disabled={busy} onClick={clear} className="text-[12px] text-sub underline">
            {t("지우기")}
          </button>
        )}
      </div>
      {mine ? (
        <p className="text-[14px] text-ink">
          <span className="font-semibold text-violet">{mine.terminal ? `${mine.terminal}${t("행")} ` : ""}{mine.trainNo}{t("열차")}</span>
          {" · "}
          {data.same > 0 ? <span className="font-semibold">{t("같은 열차에 탄 회원")} {data.same}{t("명")}</span> : <span className="text-sub">{t("같은 열차 회원은 아직 없어요")}</span>}
        </p>
      ) : (
        <p className="text-[13px] text-sub">{t("탄 열차를 고르면 같은 열차에 탄 분과 먼저 이어 드려요.")}</p>
      )}
      {open && data.trains.length > 0 && (
        <div className="space-y-2">
          {data.trains.map((x) => (
            <button
              key={x.trainNo}
              type="button"
              disabled={busy}
              onClick={() => pick(x)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[14px] ${mine?.trainNo === x.trainNo ? "border-violet bg-violetSoft" : "border-line bg-white"}`}
            >
              <span className="min-w-0 truncate font-semibold text-ink">
                {x.terminal}{t("행")}
                {x.express && <span className="ml-1 text-[12px] text-violet">{t("급행")}</span>}
                {x.last && <span className="ml-1 text-[12px] text-sub">{t("막차")}</span>}
              </span>
              <span className="num shrink-0 text-[13px] text-sub">{when(x)} · {x.trainNo}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" data-block-id="B497" disabled={busy} onClick={load} className="w-full rounded-xl bg-violet px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40">
        {busy ? t("불러오는 중…") : mine ? t("열차 다시 고르기") : t("지금 들어오는 열차 불러오기")}
      </button>
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  );
}
