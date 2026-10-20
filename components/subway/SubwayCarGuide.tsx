"use client";
import { useEffect, useMemo, useState } from "react";
import { dayName } from "@/lib/i18n";
import { MIN_SAMPLE, slotOf, type CarRank, type Estimate, type GuideResult } from "@/lib/seatCar";
import type { Congestion, CongestionLevel } from "@/lib/congestion";
import { carNumbersOf, type LineId } from "@/lib/subway";
import { DOOR_NUMBERS, positionLabel } from "@/lib/subwayPosition";
import { headingFor, headingsAt } from "@/lib/subwayRoute";
import { api, btnGhost, field, useLang, useT } from "../ui";

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
 * 탑승 칸 안내. 역과 탑승 시각이 있으면 바로 혼잡도 답을 보여 주고,
 * 칸 추천은 착석 기록이 쌓이면 이어서 보여 준다. 기록 남기기는 접힌 영역에 둔다.
 */
export default function SubwayCarGuide({ line, station, alight = "", timeGo, days, prefer = "" }: { line: LineId; station: string; alight?: string; timeGo: string; days: string; prefer?: string }) {
  const t = useT();
  const lang = useLang();
  const selectedDays = useMemo(() => [...days].filter((d) => /^[0-6]$/.test(d)).sort(), [days]);
  // 방향은 상행/하행 대신 다음역(종착역) 이름으로 고른다. 하차역이 있으면 그 방향을 먼저 고른다.
  const headings = useMemo(() => headingsAt(line, station), [line, station]);
  const preferred = useMemo(() => prefer || (alight ? headingFor(line, station, alight)?.next ?? "" : ""), [line, station, alight, prefer]);
  const [pick, setPick] = useState("");
  const [fallbackDir, setFallbackDir] = useState<Dir>("up"); // 역 순서가 없는 노선용
  const heading = headings.find((h) => h.next === pick) ?? headings.find((h) => h.next === preferred) ?? headings[0];
  const dir: Dir = heading ? heading.dir : fallbackDir;
  const [dow, setDow] = useState<string>("");
  const [data, setData] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [car, setCar] = useState("");
  const [door, setDoor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const day = dow && selectedDays.includes(dow) ? dow : selectedDays[0] ?? "";
  const slot = slotOf(timeGo);
  const ready = !!station && !!day && !!slot;

  // 역·방향·요일·시간대가 바뀔 때만 다시 불러온다. 이전 요청은 취소한다.
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

  const send = async (seated: boolean) => {
    if (!ready || !car || !door) {
      setNote(t("칸과 문 번호를 먼저 골라 주세요."));
      return;
    }
    setBusy(true);
    setNote("");
    const r = await api("/api/seat/car/feedback", "POST", { line, station, dir, dow: day, slot, car, entrance: door, seated });
    setBusy(false);
    if (!r.ok) return setNote(t(r.error));
    setNote(t("알려 주셔서 고마워요. 다음 안내에 반영돼요."));
  };

  if (!ready) {
    return (
      <section className="rounded-2xl border border-line bg-white p-4" data-block-id="S062" data-block-name="탑승 칸 안내">
        <p className="text-sm font-semibold text-ink">{t("이 시간에 타면")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-sub">{t("탑승역과 탑승 시각을 넣으면 혼잡도와 칸 안내를 바로 보여 드려요.")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-white p-4" data-block-id="S062" data-block-name="탑승 칸 안내">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{t("이 시간에 타면")}</p>
        <p className="text-[13px] text-sub">
          {station} · {slot} · {dayName(lang, Number(day))}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm text-sub">{t("방향")}</p>
        {headings.length > 0 ? (
          <div role="radiogroup" aria-label={t("방향")} className="flex flex-wrap gap-2">
            {headings.map((h) => {
              const on = heading?.next === h.next;
              return (
                <button
                  key={h.next}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPick(h.next)}
                  className={`min-h-[44px] rounded-xl border px-3 py-1.5 text-left ${on ? "border-accent bg-accentSoft" : "border-line bg-white"}`}
                >
                  <span className={`block text-[14px] font-semibold ${on ? "text-accent" : "text-ink"}`}>{h.terminal ?? h.next} {t("방면")}</span>
                  <span className="block text-[12px] text-sub">{t("다음역")} {h.next}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div role="radiogroup" aria-label={t("방향")} className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
            {(["up", "down"] as Dir[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={fallbackDir === d}
                onClick={() => setFallbackDir(d)}
                className={`min-h-[40px] rounded-lg text-[14px] font-medium ${fallbackDir === d ? "bg-white text-ink shadow-sm" : "text-sub"}`}
              >
                {d === "up" ? t("상행") : t("하행")}
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedDays.length > 1 && (
        <label className="block w-1/2 text-sm text-sub">
          {t("요일")}
          <select className={`${field} mt-1`} value={day} onChange={(e) => setDow(e.target.value)}>
            {selectedDays.map((d) => (
              <option key={d} value={d}>{dayName(lang, Number(d))}</option>
            ))}
          </select>
        </label>
      )}

      {/* 답 1: 혼잡도 */}
      {loading && !data && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {err && <p className="text-[14px] text-warn">{err}</p>}
      {data && (data.congestion ? <CongestionAnswer c={data.congestion} /> : <p className="text-[13px] text-sub">{t("이 역·방향은 혼잡도 자료가 없어요.")}</p>)}

      {/* 답 2: 칸 — 기록이 30건 이상이면 기록 순위, 아니면 현재 기준 추정. 둘 다 적중확률(%)로 보여 준다. */}
      {data?.status === "ready" && top ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">{t("앉을 가능성이 높은 위치")}</p>
          <ul className="space-y-2">
            {data.ranked.map((r, i) => (
              <li key={`${r.car}-${r.entrance}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {i === 0 && <span className="mr-1.5 text-accent">{t("추천")}</span>}
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
          <p className="text-[12px] leading-relaxed text-sub">{t("승강장 바닥의 삼각형 표시(칸-문)를 찾아 그 앞에서 기다리세요. 이 시간대 착석 기록으로 계산한 적중확률이에요.")}</p>
          <CarPlan car={top.car} />
        </div>
      ) : data?.estimate ? (
        <EstimateAnswer e={data.estimate} carCount={carNumbersOf(line).length} />
      ) : null}

      {/* 기록 남기기: 접힌 영역 */}
      <details className="rounded-2xl border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">{t("방금 탄 위치 알려 주기")}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-[13px] leading-relaxed text-sub">{t("탄 곳 바닥의 삼각형 표시 번호(예: 6-1)를 골라 주세요.")}</p>
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
          {car && door && <p className="num text-center text-[15px] font-semibold text-ink">{positionLabel(car, door)}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={btnGhost} disabled={busy} onClick={() => send(true)}>{t("앉았어요")}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => send(false)}>{t("못 앉았어요")}</button>
          </div>
          {note && <p className="text-[13px] text-sub">{note}</p>}
        </div>
      </details>
    </section>
  );
}

/** 이 역·방향·요일·시간대의 혼잡도 답. 자료 출처를 함께 적는다. */
function CongestionAnswer({ c }: { c: Congestion }) {
  const t = useT();
  return (
    <div className="space-y-3 rounded-2xl bg-bg px-4 py-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-sub">{t("혼잡도")}</p>
          <p className="num text-[32px] font-semibold leading-none text-ink">{c.pct}%</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${c.level === "low" ? "bg-white text-sub" : "bg-accentSoft text-accent"}`}>{t(c.label)}</span>
      </div>
      <p className="text-[15px] text-ink">{t(HINT[c.level])}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, c.pct)}%` }} />
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
    <span className={`num shrink-0 rounded-full px-3 py-1 text-right text-[13px] font-semibold ${pct >= 60 ? "bg-accentSoft text-accent" : pct >= 35 ? "bg-bg text-ink" : "bg-bg text-sub"}`}>
      <span className="block text-[10px] font-normal text-sub">{t("적중확률")}</span>
      {pct}%
    </span>
  );
}

/** 기록이 모자랄 때도 바로 보여 주는 현재 기준 추정(혼잡도 + 칸 위치 + 쌓인 기록). */
function EstimateAnswer({ e, carCount }: { e: Estimate; carCount: number }) {
  const t = useT();
  const best = e.cars[0];
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
                {i === 0 && <span className="mr-1.5 text-accent">{t("추천")}</span>}
                <span className="num">{c.car}</span>{t("번째 칸")}
                <span className="ml-1.5 text-[13px] font-normal text-sub">/ {carCount}{t("칸")}</span>
              </p>
              <p className="num text-[12px] text-sub">{c.n > 0 ? `${t("착석 기록")} ${c.n}${t("건 반영")}` : Number(c.car) === 1 || Number(c.car) === carCount ? t("맨 끝 칸 · 덜 붐비는 편") : t("칸 위치 기준")}</p>
            </div>
            <Chance p={c.prob} />
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-relaxed text-sub">
        {e.basis === "congestion" ? t("서울교통공사 혼잡도와 칸 위치로 계산한 현재 기준 추정이에요.") : t("이 역은 혼잡도 자료가 없어 칸 위치로만 추정했어요.")} {t("착석 기록")} {e.records}{t("건 반영")} · {t("기록이 쌓일수록 정확해져요")}({MIN_SAMPLE}{t("건부터 기록 순위로 바뀌어요")}).
      </p>
      {best && <CarPlan car={best.car} />}
    </div>
  );
}

/** 차량 안 위치를 보여 주는 범용 조감도. 노선별 실제 도면이 없어서 한 가지 모양을 쓴다. */
function CarPlan({ car }: { car: string }) {
  const t = useT();
  const doors = [60, 132, 188, 260];
  const zones = [
    { x: 22, w: 84, label: t("앞쪽") },
    { x: 118, w: 84, label: t("가운데") },
    { x: 214, w: 84, label: t("뒤쪽") },
  ];
  return (
    <figure className="rounded-2xl bg-bg p-3">
      <svg viewBox="0 0 320 132" role="img" aria-label={`${car}${t("호차")} ${t("차량 안 위치")}`} className="h-auto w-full">
        {/* 차체 */}
        <rect x="6" y="20" width="308" height="92" rx="22" fill="#FFFFFF" stroke="#D9DEE8" strokeWidth="1.25" />
        {/* 문 (위·아래 벽) */}
        {doors.map((x) => (
          <g key={x}>
            <rect x={x - 10} y="17" width="20" height="6" rx="2" fill="#FFFFFF" stroke="#B9C2D3" strokeWidth="1" />
            <rect x={x - 10} y="109" width="20" height="6" rx="2" fill="#FFFFFF" stroke="#B9C2D3" strokeWidth="1" />
          </g>
        ))}
        {/* 좌석 구역 (위·아래 줄) */}
        {zones.map((z) => (
          <g key={z.label}>
            <rect x={z.x} y="30" width={z.w} height="18" rx="6" fill="#F3F0FF" stroke="#DCD3F7" strokeWidth="1" />
            <rect x={z.x} y="84" width={z.w} height="18" rx="6" fill="#F3F0FF" stroke="#DCD3F7" strokeWidth="1" />
          </g>
        ))}
        {/* 통로 */}
        <line x1="20" y1="66" x2="300" y2="66" stroke="#E6E9F0" strokeWidth="1" strokeDasharray="4 4" />
        {/* 구역 이름 */}
        {zones.map((z) => (
          <text key={`${z.label}-t`} x={z.x + z.w / 2} y="122" textAnchor="middle" fontSize="11" fill="#6B7385">{z.label}</text>
        ))}
        {/* 칸 번호 */}
        <text x="18" y="46" fontSize="12" fontWeight="600" fill="#2B3445">{car}</text>
      </svg>
      <figcaption className="mt-2 text-center text-[12px] text-sub">{t("칸 안의 앞·가운데·뒤 구역과 문 위치를 나타낸 참고 그림이에요. 실제 차량은 노선마다 다를 수 있어요.")}</figcaption>
    </figure>
  );
}
