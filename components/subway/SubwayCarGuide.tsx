"use client";
import { useEffect, useMemo, useState } from "react";
import { MIN_SAMPLE, slotOf, type CarRank, type Estimate, type GuideResult } from "@/lib/seatCar";
import type { Congestion, CongestionLevel } from "@/lib/congestion";
import { carNumbersOf, type LineId } from "@/lib/subway";
import { positionLabel } from "@/lib/subwayPosition";
import { headingFor, headingsAt } from "@/lib/subwayRoute";
import { useT } from "../ui";

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
export default function SubwayCarGuide({ line, station, alight = "", timeGo, prefer = "" }: { line: LineId; station: string; alight?: string; timeGo: string; prefer?: string }) {
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

      {/* 칸 3개 — 기록이 30건 이상이면 기록 순위, 아니면 현재 기준 추정. 둘 다 적중확률(%)로 보여 준다. */}
      {data?.status === "ready" && top ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">{t("앉을 가능성이 높은 위치")}</p>
          <ul className="space-y-2">
            {data.ranked.map((r, i) => (
              <li key={`${r.car}-${r.entrance}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {i === 0 && <span className="mr-1.5 text-violet">{t("추천")}</span>}
                    <span className="num">{positionLabel(r.car, r.entrance)}</span>
                    <span className="ml-1.5 text-[13px] font-normal text-sub">
                      {r.car}{t("번째 칸")} {r.entrance}{t("번 문")}
                    </span>
                  </p>
                  <p className="num text-[12px] text-sub">{t("착석 기록")} {r.seated}/{r.n}{t("건")}</p>
                </div>
                <Chance p={r.rate} />
              </li>
            ))}
          </ul>
          <p className="text-[12px] leading-relaxed text-sub">{t("승강장 바닥의 삼각형 표시(칸-문)를 찾아 그 앞에서 기다리세요.")}</p>
        </div>
      ) : data?.estimate ? (
        <EstimateAnswer e={data.estimate} carCount={carNumbersOf(line).length} />
      ) : null}

      {/* 혼잡도 자료가 없으면 추정 아래 안내 한 줄로 충분하다(같은 말을 두 번 하지 않는다). */}
      {data?.congestion && <CongestionAnswer c={data.congestion} />}

      <Tips carCount={carNumbersOf(line).length} />
    </section>
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
        <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${c.level === "low" ? "bg-white text-sub" : "bg-violetSoft text-violet"}`}>{t(c.label)}</span>
      </div>
      <p className="text-[15px] text-ink">{t(HINT[c.level])}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-violet" style={{ width: `${Math.min(100, c.pct)}%` }} />
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
    <span className={`num shrink-0 rounded-full px-3 py-1 text-right text-[13px] font-semibold ${pct >= 60 ? "bg-violetSoft text-violet" : pct >= 35 ? "bg-bg text-ink" : "bg-bg text-sub"}`}>
      <span className="block text-[10px] font-normal text-sub">{t("적중확률")}</span>
      {pct}%
    </span>
  );
}

/** 기록이 모자랄 때도 바로 보여 주는 현재 기준 추정(혼잡도 + 칸 위치 + 쌓인 기록). */
function EstimateAnswer({ e, carCount }: { e: Estimate; carCount: number }) {
  const t = useT();
  return (
    <div className="space-y-3" data-block-id="C133" data-block-name="앉을 칸 추정">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{t("지금 기준 추천 칸")}</p>
        <p className="num text-[12px] text-sub">{t("이 시간 평균 적중확률")} <b className="text-ink">{Math.round(e.overall * 100)}%</b></p>
      </div>
      <ul className="space-y-2">
        {e.cars.map((c, i) => (
          <li key={c.car} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">
                {i === 0 && <span className="mr-1.5 text-violet">{t("추천")}</span>}
                <span className="num">{c.car}</span>{t("번째 칸")}
                <span className="ml-1.5 text-[13px] font-normal text-sub">/ {carCount}{t("칸")}</span>
              </p>
              <p className="num text-[12px] text-sub">{c.n > 0 ? `${t("착석 기록")} ${c.n}${t("건 반영")}` : Number(c.car) === 1 || Number(c.car) === carCount ? t("맨 끝 칸 · 좌석이 적어요") : Number(c.car) === 2 || Number(c.car) === carCount - 1 ? t("끝에서 두 번째 칸 · 덜 붐비고 좌석이 온전해요") : t("칸 위치 기준")}</p>
            </div>
            <Chance p={c.prob} />
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-relaxed text-sub">
        {e.basis === "congestion" ? t("서울교통공사 혼잡도와 칸 위치로 계산한 현재 기준 추정이에요.") : t("이 역은 혼잡도 자료가 없어 칸 위치로만 추정했어요.")} {t("착석 기록")} {e.records}{t("건 반영")} · {t("기록이 쌓일수록 정확해져요")}({MIN_SAMPLE}{t("건부터 기록 순위로 바뀌어요")}).
      </p>
    </div>
  );
}
