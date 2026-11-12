"use client";
import { useCallback, useEffect, useState } from "react";
import type { LineId } from "@/lib/subway";
import { MIN_LEAD_SEC, etaLabel, planTrains, type TimedTrain, type TrainChance } from "@/lib/trainTiming";
import { api, useT } from "../ui";
import { StepTitle } from "./StepTitle";

type Train = { trainNo: string; terminal: string; msg: string; code: number; sec: number; eta: number | null; express: boolean; last: boolean };
type Mine = { line: string; trainNo: string; terminal: string; station: string } | null;
type Resp = { supported: boolean; trains: Train[]; mine: Mine; same: number };

const mins = (s: number) => `${Math.max(1, Math.round(s / 60))}분`;

/**
 * ① 들어오는 열차 고르기(2026-11-12 사용자 지시: 지하철 앉아가기 재구성).
 * 선로 그림 오른쪽 끝이 내 역, 들어오는 열차 3대가 도착 순으로 왼쪽에서 다가온다(멀수록 왼쪽).
 * 열차 사이에 앞차 간격('↔ 2분 · 붙어옴' 초록 / '↔ 7분 · 붐빔' 코랄), 앉을 확률이 가장 높은 열차는 노선 색 + [추천],
 * 2분 안에 오는 열차는 흐리게(놓칠 수 있음). 누르면 그 열차를 고르고(onSelect) 오늘 탄 열차로 저장(같은 열차 매칭).
 * 실시간 정보가 없는 노선이면 아무것도 그리지 않는다.
 */
export default function TrainPick({ line, station, next, best, onSelect }: { line: LineId; station: string; next?: string; best?: { car: string; door: string; prob: number }; onSelect?: (t: TrainChance | null) => void }) {
  const t = useT();
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    const r = await api<Resp>(`/api/seat/train?line=${encodeURIComponent(line)}&board=${encodeURIComponent(station)}&next=${encodeURIComponent(next ?? "")}`);
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setData(r.data);
  }, [line, station, next]);

  useEffect(() => {
    load();
  }, [load]);

  const timed: TimedTrain[] = (data?.trains ?? []).filter((x) => x.eta != null).map((x) => ({ trainNo: x.trainNo, terminal: x.terminal, eta: x.eta as number, express: x.express, last: x.last }));
  const plan = planTrains(timed, best?.prob ?? 0.4);
  const chosen = plan.list.find((x) => x.trainNo === sel) ?? plan.best ?? plan.list[0] ?? null;

  // 고른 열차(없으면 추천 열차)를 위로 알린다 — ② 칸-문 카드가 그 열차 기준으로 바뀐다.
  const chosenKey = chosen ? `${chosen.trainNo}|${chosen.prob}|${chosen.eta}` : "";
  useEffect(() => {
    onSelect?.(chosen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey]);

  const pick = async (tr: TrainChance) => {
    setSel(tr.trainNo);
    const r = await api<{ mine: Mine; same: number }>("/api/seat/train", "POST", { line, trainNo: tr.trainNo, terminal: tr.terminal, station });
    if (r.ok) setData((d) => (d ? { ...d, mine: r.data.mine, same: r.data.same } : d));
  };

  if (!data) return busy ? <p className="text-[13px] text-sub">{t("열차 정보를 불러오는 중…")}</p> : msg ? <p className="text-[13px] text-sub">{t(msg)}</p> : null;
  if (!data.supported) return null;

  const list = plan.list;
  // 선로 위 위치: 도착 순서대로 내 역(오른쪽)에서 왼쪽으로 고르게(시각이 붙어 있어도 겹치지 않게).
  const slots = [70, 43, 16];
  const mine = data.mine && data.mine.line === line ? data.mine : null;

  return (
    <div data-block-id="C441" data-block-name="들어오는 열차 고르기" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <StepTitle n={1} title={t("들어오는 열차 고르기")} />
        <button type="button" data-block-id="B497" disabled={busy} onClick={load} className="flex items-center gap-1 rounded-full bg-lcSoft px-2.5 py-1 text-[12px] font-semibold text-ink disabled:opacity-50">
          <span className="h-1.5 w-1.5 rounded-full bg-lc" aria-hidden />
          {busy ? t("불러오는 중…") : t("실시간 · 새로고침")}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl bg-bg px-4 py-3 text-[13px] text-sub">{t("지금 들어오는 열차 정보가 없어요. 잠시 뒤 새로고침을 눌러 주세요.")}</p>
      ) : (
        <div className="rounded-2xl border border-line bg-white px-3 pb-3 pt-2">
          <div className="relative h-[124px]" role="radiogroup" aria-label={t("들어오는 열차")}>
            {/* 선로 */}
            <div className="absolute left-2 right-10 top-[54px] h-1.5 rounded-full bg-lcSoft" aria-hidden />
            {/* 내 역 */}
            <div className="absolute right-0 top-[44px] w-10 text-center" aria-hidden>
              <div className="mx-auto h-4 w-4 rounded-full border-4 border-brand bg-white" style={{ marginTop: 3 }} />
              <p className="mt-1 truncate text-[11px] font-bold text-brand">{station}</p>
            </div>
            {list.map((x, idx) => {
              const isBest = plan.best?.trainNo === x.trainNo;
              const on = chosen?.trainNo === x.trainNo;
              const miss = x.eta < MIN_LEAD_SEC;
              return (
                <button
                  key={x.trainNo}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${etaLabel(x.eta)} ${x.terminal}${t("행")} ${x.trainNo} ${t("앉을 확률")} ${Math.round(x.prob * 100)}%`}
                  onClick={() => pick(x)}
                  className="absolute top-[22px] flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${slots[idx] ?? 16}%`, opacity: miss ? 0.45 : 1 }}
                >
                  <span className={`mb-1 h-[18px] whitespace-nowrap rounded-md px-1.5 text-[11px] font-bold leading-[18px] ${isBest ? "bg-brand text-white" : "invisible"}`}>{t("추천")}</span>
                  <span
                    className={`num grid h-9 min-w-[52px] place-items-center rounded-[10px] border-2 px-1.5 text-[12px] font-bold ${on ? "border-lc bg-lc text-lcInk" : "border-[#C9CED8] bg-white text-sub"}`}
                    style={on ? { boxShadow: "0 0 0 4px var(--lc-soft, #EEF0F5)" } : undefined}
                  >
                    {x.trainNo}
                  </span>
                  <span className={`mt-1 text-[12px] font-bold ${on ? "text-ink" : "text-sub"}`}>{t(etaLabel(x.eta))}</span>
                  <span className="num text-[11px] text-sub">{Math.round(x.prob * 100)}%</span>
                </button>
              );
            })}
          </div>
          {/* 앞차 간격 */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-[11.5px] font-semibold">
            {list.map((x, i) =>
              x.gap == null ? null : (
                <span key={x.trainNo} className={x.gap < plan.typicalGap ? "text-mint" : x.gap > plan.typicalGap ? "text-coral" : "text-sub"}>
                  {i === 0 ? t("앞차") : `${list[i - 1].trainNo}`}↔{x.trainNo} {t(mins(x.gap))} · {x.gap < plan.typicalGap ? t("붙어옴") : x.gap > plan.typicalGap ? t("붐빔") : t("보통")}
                </span>
              ),
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-sub">{t("앞차에 바짝 붙어오는 열차일수록 승강장에 기다린 사람이 적어 앉기 쉬워요. 흐린 열차는 놓칠 수 있어요.")}</p>
        </div>
      )}

      {mine && (
        <p className="px-1 text-[12.5px] text-sub">
          {t("내가 탄 열차")} <b className="num text-ink">{mine.trainNo}</b> ·{" "}
          {data.same > 0 ? <b className="text-ink">{t("같은 열차 회원")} {data.same}{t("명")}</b> : t("같은 열차 회원은 아직 없어요")}
        </p>
      )}
    </div>
  );
}
