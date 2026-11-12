"use client";
import { useCallback, useEffect, useState } from "react";
import type { LineId } from "@/lib/subway";
import { etaLabel, planTrains, type TimedTrain, type TrainChance } from "@/lib/trainTiming";
import { api, useT } from "../ui";

type Train = { trainNo: string; terminal: string; msg: string; code: number; sec: number; eta: number | null; express: boolean; last: boolean };
type Mine = { line: string; trainNo: string; terminal: string; station: string } | null;
type Resp = { supported: boolean; trains: Train[]; mine: Mine; same: number };

const ORDER = ["", "첫 번째", "두 번째", "세 번째"];
const mins = (s: number) => `${Math.max(1, Math.round(s / 60))}분`;

/**
 * 열차별 앉을 확률 + 내가 탄 열차(2026-11-12 사용자 지시).
 * 서울시 실시간 도착정보로 내 방향 열차 3대의 도착 시각과 앞차 간격을 계산해, 칸 안내 1순위 칸-문(best)의
 * 앉을 확률을 열차마다 보여 주고 가장 높은 열차를 추천한다. 열차를 누르면 오늘 탄 열차로 저장(같은 열차 매칭).
 * 실시간 정보가 없는 노선이면 숨긴다.
 */
export default function TrainPick({ line, station, next, best }: { line: LineId; station: string; next?: string; best?: { car: string; door: string; prob: number } }) {
  const t = useT();
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMsg("");
    const r = await api<Resp>(`/api/seat/train?line=${encodeURIComponent(line)}&board=${encodeURIComponent(station)}&next=${encodeURIComponent(next ?? "")}`);
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setData(r.data);
  }, [line, station, next]);

  // 칸 안내가 열릴 때 한 번 불러온다(같은 역은 서버가 25초 동안 다시 씀).
  useEffect(() => {
    load();
  }, [load]);

  const pick = async (tr: TrainChance) => {
    setBusy(true);
    const r = await api<{ mine: Mine; same: number }>("/api/seat/train", "POST", { line, trainNo: tr.trainNo, terminal: tr.terminal, station });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setData((d) => (d ? { ...d, mine: r.data.mine, same: r.data.same } : d));
  };

  const clear = async () => {
    setBusy(true);
    await api("/api/seat/train", "DELETE");
    setBusy(false);
    setData((d) => (d ? { ...d, mine: null, same: 0 } : d));
  };

  if (!data?.supported) return msg && !data ? <p className="text-[13px] text-sub">{t(msg)}</p> : null;

  const timed: TimedTrain[] = data.trains.filter((x) => x.eta != null).map((x) => ({ trainNo: x.trainNo, terminal: x.terminal, eta: x.eta as number, express: x.express, last: x.last }));
  const base = best?.prob ?? 0.4;
  const plan = planTrains(timed, base);
  const pos = best ? `${best.car}-${best.door}` : "";
  const mine = data.mine && data.mine.line === line ? data.mine : null;
  const level = (p: number) => (p >= 0.6 ? t("높음") : p >= 0.4 ? t("보통") : t("낮음"));

  return (
    <div data-block-id="C441" data-block-name="열차별 앉을 확률" className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">{t("들어오는 열차별 앉을 확률")}</p>
        <button type="button" data-block-id="B497" disabled={busy} onClick={load} className="text-[12px] text-violet underline disabled:opacity-40">
          {busy ? t("불러오는 중…") : t("새로고침")}
        </button>
      </div>

      {plan.best && (
        <div data-block-id="C442" data-block-name="추천 열차" className="rounded-xl bg-violetSoft px-3.5 py-3">
          <p className="text-[12px] font-semibold text-violet">{t("추천")}</p>
          <p className="text-[15px] font-semibold leading-snug text-ink">
            {t(ORDER[plan.best.order] ?? "")} {t("열차")} · {t(etaLabel(plan.best.eta))} · <span className="num">{plan.best.trainNo}</span>
            {pos && (
              <>
                {" "}{t("의")} <span className="num text-[18px] font-bold text-violet">{pos}</span>
              </>
            )}
          </p>
          <p className="num text-[13px] text-sub">
            {t("앉을 확률")} {level(plan.best.prob)} {Math.round(plan.best.prob * 100)}%
            {plan.best.gap != null && plan.best.gap < plan.typicalGap && ` · ${t("앞차에 붙어와서 덜 붐벼요")}`}
          </p>
        </div>
      )}

      {plan.list.length > 0 ? (
        <ul className="space-y-1.5">
          {plan.list.map((x) => {
            const on = mine?.trainNo === x.trainNo;
            return (
              <li key={x.trainNo}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pick(x)}
                  aria-pressed={on}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left ${on ? "border-violet bg-violetSoft" : plan.best?.trainNo === x.trainNo ? "border-violet" : "border-line"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">
                      {t(etaLabel(x.eta))} · {x.terminal}{t("행")} <span className="num font-normal text-sub">{x.trainNo}</span>
                      {x.express && <span className="ml-1 text-[12px] text-violet">{t("급행")}</span>}
                      {x.last && <span className="ml-1 text-[12px] text-sub">{t("막차")}</span>}
                    </span>
                    <span className="num block text-[12px] text-sub">
                      {x.gap == null ? t("앞차 간격 모름") : `${t("앞차와")} ${t(mins(x.gap))} ${t("간격")}`}
                      {on && ` · ${t("내가 탄 열차")}`}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[15px] font-bold text-violet">{Math.round(x.prob * 100)}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-sub">{t("지금 들어오는 열차 정보가 없어요. 잠시 뒤 새로고침을 눌러 주세요.")}</p>
      )}

      <p className="text-[12px] leading-relaxed text-sub">
        {pos ? `${t("칸 안내 1순위")} ${pos} ${t("기준")} · ` : ""}
        {t("앞차에 바짝 붙어오는 열차일수록 승강장에 기다린 사람이 적어 앉기 쉬워요. 탄 열차를 누르면 같은 열차 회원과 먼저 이어 드려요.")}
      </p>

      {mine && (
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="text-ink">
            <span className="font-semibold text-violet">{mine.trainNo}</span> {t("열차")} ·{" "}
            {data.same > 0 ? <span className="font-semibold">{t("같은 열차 회원")} {data.same}{t("명")}</span> : <span className="text-sub">{t("같은 열차 회원은 아직 없어요")}</span>}
          </span>
          <button type="button" data-block-id="B498" disabled={busy} onClick={clear} className="text-[12px] text-sub underline">
            {t("지우기")}
          </button>
        </div>
      )}
      {msg && <p className="text-[13px] text-sub">{t(msg)}</p>}
    </div>
  );
}
