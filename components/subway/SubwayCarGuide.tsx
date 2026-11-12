"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MIN_SAMPLE, slotOf, type CarRank, type Estimate, type GuideResult } from "@/lib/seatCar";
import type { Congestion, CongestionLevel } from "@/lib/congestion";
import { carNumbersOf, type LineId } from "@/lib/subway";
import { positionLabel } from "@/lib/subwayPosition";
import { headingFor, headingsAt } from "@/lib/subwayRoute";
import { api, useT } from "../ui";
import { StepTitle } from "./StepTitle";
import { etaLabel, type TrainChance } from "@/lib/trainTiming";

// ① 들어오는 열차 고르기(서울시 실시간 정보, 2026-11-12)
const TrainPick = dynamic(() => import("./TrainPick"), { ssr: false });

type Dir = "up" | "down";
type Guide = GuideResult & { congestion: Congestion | null; estimate?: Estimate };

/** 혼잡도 단계별 한 줄 설명. */
const HINT: Record<CongestionLevel, string> = {
  low: "비교적 여유 있어요",
  mid: "보통 수준이에요",
  high: "붐비는 편이에요",
  over: "매우 붐벼요",
};

/**
 * 탑승 칸 안내. 지금 역·방향·시간대로 혼잡도와 앉을 칸 3개를 바로 보여 준다.
 * 방향은 위 '오늘 탑승' 카드에서 고른 값을 받는다(여기서 다시 묻지 않는다). 요일은 나누지 않는다.
 * 앉은 칸 기록은 '앉았어요' 뒤에 한 번만 묻는다.
 */
export default function SubwayCarGuide({ line, station, alight = "", timeGo, prefer = "", onSeated }: { line: LineId; station: string; alight?: string; timeGo: string; prefer?: string; onSeated?: (car: string) => Promise<string> }) {
  const t = useT();
  const headings = useMemo(() => headingsAt(line, station), [line, station]);
  const preferred = prefer || (alight ? headingFor(line, station, alight)?.next ?? "" : "");
  const heading = headings.find((h) => h.next === preferred) ?? headings[0];
  const dir: Dir = heading ? heading.dir : "up";
  const [data, setData] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 혼잡도 자료(평일·토·일)를 고르는 데만 오늘 요일을 쓴다. 화면에는 보이지 않는다.
  const day = String(new Date(Date.now() + 9 * 3600_000).getUTCDay());
  const slot = slotOf(timeGo);
  const ready = !!station && !!slot;

  // 역·방향·시간대가 바뀔 때만 다시 불러온다. 이전 요청은 취소한다.
  useEffect(() => {
    if (!ready) {
      setData(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setErr("");
    const q = new URLSearchParams({ line, station, dir, dow: day, slot });
    fetch(`/api/seat/car?${q.toString()}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setErr(j.error);
        setData(j as Guide);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setErr(t("불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [ready, line, station, dir, day, slot]); // t는 렌더마다 새로 만들어지므로 의존성에 넣지 않는다.

  const top: CarRank | undefined = data?.status === "ready" ? data.ranked[0] : undefined;
  // 제시한 3개 위치 중 실제로 탄 곳(기본 1순위). 고른 뒤 [앉았어요]/[앉지 못함]을 누른다.
  const [pick, setPick] = useState(0);
  const options: { car: string; door: string }[] = top && data ? data.ranked.map((r) => ({ car: r.car, door: r.entrance })) : data?.estimate ? data.estimate.cars.map((c) => ({ car: c.car, door: c.door })) : [];
  useEffect(() => setPick(0), [line, station, dir, slot]);
  // ①에서 고른 열차(없으면 추천 열차). ② 칸-문 카드의 앉을 확률이 이 열차 기준으로 바뀐다.
  const [train, setTrain] = useState<TrainChance | null>(null);
  const ranks: { car: string; door: string; prob: number }[] = top && data ? data.ranked.map((r) => ({ car: r.car, door: r.entrance, prob: r.rate })) : data?.estimate ? data.estimate.cars.map((c) => ({ car: c.car, door: c.door, prob: c.prob })) : [];
  const base = ranks[0];
  const chosen = ranks[Math.min(pick, Math.max(0, ranks.length - 1))];
  // 1순위 칸-문은 고른 열차 기준 확률, 다른 후보는 열차 간격 비율만큼 같이 조정
  const chosenProb = chosen ? (train && base ? Math.min(0.95, chosen.prob * (train.prob / Math.max(0.01, base.prob))) : chosen.prob) : 0;

  if (!ready) {
    return <p className="text-[13px] leading-relaxed text-sub">{t("탑승역을 고르면 혼잡도와 칸 안내를 바로 보여 드려요.")}</p>;
  }

  return (
    <section className="space-y-4" data-block-id="S062" data-block-name="탑승 칸 안내">
      <p className="text-[13px] text-sub">
        {station} · {slot} {t("기준")}
      </p>

      {loading && !data && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {err && <p className="text-[14px] text-warn">{err}</p>}

      {/* ① 들어오는 열차 고르기(실시간 정보 있는 노선만 — 없으면 그리지 않고 ②부터) */}
      {data && base && <TrainPick line={line} station={station} next={heading?.next} best={base} onSelect={setTrain} />}

      {/* ② 이 칸-문 앞에서 기다리세요: 고른 열차 + 칸 그림(추천 칸 = 노선 색) + 큰 칸-문 + 후보 목록 */}
      {data && chosen && (
        <div data-block-id="C443" data-block-name="기다릴 칸-문" className="space-y-3 rounded-2xl border-2 border-lc bg-white p-4">
          <StepTitle n={2} title={t("이 칸-문 앞에서 기다리세요")} />
          {train && (
            <div className="flex items-baseline justify-between gap-2">
              <p className="num text-[19px] font-extrabold text-ink">{train.trainNo} · {t(etaLabel(train.eta))}</p>
              <p className="truncate text-[13px] text-sub">{train.terminal}{t("행")}</p>
            </div>
          )}
          <CarStrip count={carNumbersOf(line).length} on={chosen.car} />
          <div className="flex items-center gap-3">
            <span className="num rounded-xl bg-bg px-3.5 py-0.5 text-[34px] font-black leading-tight text-brand">{positionLabel(chosen.car, chosen.door)}</span>
            <p className="min-w-0 text-[13px] leading-snug text-sub">
              {chosen.car}{t("번째 칸")} · {chosen.door}{t("번 문")}
              <br />
              {t("앉을 확률")} <b className="num text-ink">{t(probLabel(chosenProb))} {Math.round(chosenProb * 100)}%</b>
              {train?.gap != null && pick === 0 && <span className="block text-[12px]">{train.gap < 240 ? t("앞차에 붙어와서 덜 붐벼요") : t("앞차와 간격이 길어 붐빌 수 있어요")}</span>}
            </p>
          </div>
          {/* 다른 후보(기록 순위 또는 현재 기준 추정) — 누르면 위 칸 그림·칸-문이 바뀐다 */}
          {data.status === "ready" && top ? (
            <ul className="space-y-1.5">
              {data.ranked.map((r, i) => (
                <li key={`${r.car}-${r.entrance}`} role="radio" aria-checked={pick === i} tabIndex={0} onClick={() => setPick(i)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && setPick(i)} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 ${pick === i ? "border-lc bg-lcSoft" : "border-line"}`}>
                  <span className="text-[14px] text-ink">
                    {i === 0 && <span className="mr-1 text-[12px] font-bold text-brand">{t("추천")}</span>}
                    <b className="num text-[17px]">{positionLabel(r.car, r.entrance)}</b>
                    <span className="num ml-1.5 text-[12px] text-sub">{t("착석 기록")} {r.seated}/{r.n}{t("건")}</span>
                  </span>
                  <Chance p={r.rate} />
                </li>
              ))}
            </ul>
          ) : data.estimate ? (
            <EstimateAnswer e={data.estimate} carCount={carNumbersOf(line).length} pick={pick} onPick={setPick} />
          ) : null}
        </div>
      )}

      {/* ③ 탔나요? */}
      {data && options.length > 0 && (
        <div className="space-y-2">
          <StepTitle n={3} title={t("탔나요?")} />
          <SeatResult key={`${line}-${station}-${dir}-${slot}`} onSeated={onSeated} seatKey={{ line, station, dir, dow: day, slot }} carCount={carNumbersOf(line).length} chosen={options[Math.min(pick, options.length - 1)]} />
        </div>
      )}

      {/* 혼잡도 자료가 없으면 추정 아래 안내 한 줄로 충분하다(같은 말을 두 번 하지 않는다). */}
      {data?.congestion && <CongestionAnswer c={data.congestion} />}

      <Tips carCount={carNumbersOf(line).length} />
    </section>
  );
}

const probLabel = (p: number) => (p >= 0.6 ? "높음" : p >= 0.4 ? "보통" : "낮음");

/** 칸 그림: 1~n칸 중 추천 칸을 노선 색으로 칠하고 아래에 남색 삼각형. */
function CarStrip({ count, on }: { count: number; on: string }) {
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: count }, (_, i) => String(i + 1)).map((c) => (
        <span key={c} className={`num relative grid h-[30px] flex-1 place-items-center rounded-md border text-[11px] font-bold ${c === on ? "border-lc bg-lc text-lcInk" : "border-line bg-bg text-sub"}`}>
          {c}
          {c === on && <span className="absolute -bottom-[8px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[7px] border-x-transparent border-b-brand" />}
        </span>
      ))}
    </div>
  );
}

/** 앉아가는 요령. 맨 끝 칸은 덜 붐비지만 서서 가는 공간(손잡이 기둥)이 많아 좌석이 적다. */
function Tips({ carCount }: { carCount: number }) {
  const t = useT();
  return (
    <div className="space-y-1.5 rounded-2xl bg-bg px-4 py-3" data-block-id="C134" data-block-name="앉아가기 요령">
      <p className="text-[13px] font-semibold text-ink">{t("앉아가는 요령")}</p>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-sub">
        <li>{t("열차가 바로 뒤따라 붙어 오면 앞차를 보내고 약 2분 기다렸다가, 뒤차를 줄 맨 앞에서 타세요.")}</li>
        <li>{`1${t("번째 칸")}·${carCount}${t("번째 칸")}${t("(맨 끝)은 덜 붐비지만 서서 가는 공간이 많아 좌석이 적어요.")}`}</li>
        <li>{t("환승역·큰 역 바로 전에 내리는 분 앞에 서면 자리가 빨리 나요.")}</li>
      </ul>
    </div>
  );
}

/** 이 역·방향·시간대의 혼잡도 답. 자료 출처를 함께 적는다. */
function CongestionAnswer({ c }: { c: Congestion }) {
  const t = useT();
  return (
    <div className="space-y-3 rounded-2xl bg-bg px-4 py-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-sub">{t("혼잡도")}</p>
          <p className="num text-[32px] font-semibold leading-none text-ink">{c.pct}%</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${c.level === "low" ? "bg-white text-sub" : "bg-lcSoft text-brand"}`}>{t(c.label)}</span>
      </div>
      <p className="text-[15px] text-ink">{t(HINT[c.level])}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, c.pct)}%` }} />
      </div>
      <p className="text-[12px] leading-relaxed text-sub">{t("서울교통공사 2026년 6월 자료 · 이 역·방향·시간대 기준")}</p>
    </div>
  );
}

/** 적중확률 표시(%) */
function Chance({ p }: { p: number }) {
  const t = useT();
  const pct = Math.round(p * 100);
  return (
    <span className={`num shrink-0 rounded-full px-3 py-1 text-right text-[13px] font-semibold ${pct >= 60 ? "bg-lcSoft text-brand" : pct >= 35 ? "bg-bg text-ink" : "bg-bg text-sub"}`}>
      <span className="block text-[10px] font-normal text-sub">{t("적중확률")}</span>
      {pct}%
    </span>
  );
}

/** 기록이 모자랄 때도 바로 보여 주는 현재 기준 추정(혼잡도 + 칸 위치 + 쌓인 기록). */
function EstimateAnswer({ e, carCount, pick, onPick }: { e: Estimate; carCount: number; pick: number; onPick: (i: number) => void }) {
  const t = useT();
  return (
    <div className="space-y-3" data-block-id="C133" data-block-name="앉을 칸 추정">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{t("지금 기준 추천 칸")}</p>
        <p className="num text-[12px] text-sub">{t("이 시간 평균 적중확률")} <b className="text-ink">{Math.round(e.overall * 100)}%</b></p>
      </div>
      <ul className="space-y-2">
        {e.cars.map((c, i) => (
          <li key={c.car} role="radio" aria-checked={pick === i} tabIndex={0} onClick={() => onPick(i)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onPick(i)} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 ${pick === i ? "border-lc bg-lcSoft" : "border-line"}`}>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">
                {i === 0 && <span className="mr-1.5 text-brand">{t("추천")}</span>}
                <span className="num text-[22px] font-bold">{positionLabel(c.car, c.door)}</span>
                <span className="ml-1.5 text-[13px] font-normal text-sub">{c.car}{t("번째 칸")} {c.door}{t("번 문")} · {t("또는")} <span className="num">{positionLabel(c.car, c.alt)}</span></span>
              </p>
              <p className="num text-[12px] text-sub">{c.n > 0 ? `${t("착석 기록")} ${c.n}${t("건 반영")}` : Number(c.car) === 1 || Number(c.car) === carCount ? t("맨 끝 칸 · 좌석이 적어요") : Number(c.car) === 2 || Number(c.car) === carCount - 1 ? t("끝에서 두 번째 칸 · 덜 붐비고 좌석이 온전해요") : t("칸 위치 기준")}</p>
            </div>
            <Chance p={c.prob} />
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-relaxed text-sub">
        {t("칸-문은 승강장 바닥의 삼각형 표시예요(예: 2-3 = 2번째 칸 3번 문).")} {e.basis === "congestion" ? t("서울교통공사 혼잡도와 칸 위치로 계산한 현재 기준 추정이에요.") : t("이 역은 혼잡도 자료가 없어 칸 위치로만 추정했어요.")} {t("착석 기록")} {e.records}{t("건 반영")} · {t("기록이 쌓일수록 정확해져요")}({MIN_SAMPLE}{t("건부터 기록 순위로 바뀌어요")}).
      </p>
    </div>
  );
}

/**
 * 탄 결과 기록(2026-10-30 사용자 지시): 위 3개 위치 중 탄 곳을 고르고 [앉았어요](보라)·[앉지 못함](검정 바탕·흰 글자)을 누른다.
 * 목록에 없는 칸에서 탔으면 '다른 칸-문'으로 직접 고른다. 회원 번호 없이 저장되고 다음 추천 확률에 바로 반영된다.
 */
function SeatResult({ seatKey, carCount, chosen, onSeated }: { seatKey: { line: LineId; station: string; dir: Dir; dow: string; slot: string }; carCount: number; chosen: { car: string; door: string }; onSeated?: (car: string) => Promise<string> }) {
  const t = useT();
  const [other, setOther] = useState(false);
  const [car, setCar] = useState("");
  const [door, setDoor] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ label: string; seated: boolean; note?: string } | null>(null);
  const [err, setErr] = useState("");
  const pos = other ? { car, door } : chosen;
  const label = positionLabel(pos.car, pos.door);
  const save = async (seated: boolean) => {
    if (!pos.car || !pos.door) return setErr(t("탄 칸과 문을 골라 주세요."));
    setBusy(true);
    setErr("");
    const r = await api("/api/seat/car/feedback", "POST", { ...seatKey, car: pos.car, entrance: pos.door, seated });
    if (!r.ok) {
      setBusy(false);
      return setErr(t(r.error));
    }
    // 앉았으면 같은 방향 분께 알림·적립까지 한 번에(지하철 메뉴에서 넘겨준 경우)
    const note = seated && onSeated ? await onSeated(pos.car).catch(() => "") : "";
    setBusy(false);
    setDone({ label, seated, note });
  };
  if (done)
    return (
      <p role="status" className={`rounded-2xl px-4 py-3 text-[14px] ${done.seated ? "bg-mintSoft text-mint" : "bg-bg text-ink"}`}>
        <b className="num">{done.label}</b> · {done.seated ? t("앉은 기록을 남겼어요.") : t("못 앉은 기록을 남겼어요.")} {t("다음 추천에 반영돼요.")}
        {done.note && <span className="mt-1 block font-semibold">{done.note}</span>}
      </p>
    );
  return (
    <div data-block-id="C421" data-block-name="탄 결과 기록" className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <p className="text-[14px] text-ink">
        {t("탄 위치")} <b className="num text-[18px]">{label || "-"}</b>
        <span className="ml-1 text-[13px] text-sub">{other ? t("(직접 고름)") : t("(위 목록에서 고르기)")}</span>
      </p>
      {other && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("탄 칸")}>
            {Array.from({ length: carCount }, (_, i) => String(i + 1)).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={car === c} onClick={() => setCar(c)} className={`min-h-[36px] min-w-[44px] rounded-xl border px-2.5 text-[13px] ${car === c ? "border-lc bg-lcSoft font-semibold text-brand" : "border-line bg-white text-sub"}`}>
                {c}{t("칸")}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label={t("문")}>
            {["1", "2", "3", "4"].map((d) => (
              <button key={d} type="button" role="radio" aria-checked={door === d} onClick={() => setDoor(d)} className={`min-h-[36px] min-w-[44px] rounded-xl border px-2.5 text-[13px] ${door === d ? "border-lc bg-lcSoft font-semibold text-brand" : "border-line bg-white text-sub"}`}>
                {d}{t("번 문")}
              </button>
            ))}
          </div>
        </div>
      )}
      {err && <p className="text-[13px] text-warn">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" data-block-id="B432" data-block-name="앉았어요 기록" disabled={busy} onClick={() => save(true)} className="rounded-2xl bg-brand py-3.5 text-[16px] font-semibold text-white active:opacity-90 disabled:opacity-50">{t("앉았어요")}</button>
        <button type="button" data-block-id="B430" data-block-name="앉지 못함" disabled={busy} onClick={() => save(false)} className="rounded-2xl border border-line bg-white py-3.5 text-[16px] font-semibold text-ink active:opacity-90 disabled:opacity-50">{t("못 앉았어요")}</button>
      </div>
      <button type="button" data-block-id="B431" data-block-name="다른 칸-문 고르기" onClick={() => setOther((v) => !v)} className="min-h-0 text-[13px] text-sub underline">
        {other ? t("위 목록에서 고르기") : t("목록에 없는 칸-문에서 탔어요")}
      </button>
    </div>
  );
}
