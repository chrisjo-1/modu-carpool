"use client";
import { useEffect, useMemo, useState } from "react";
import { dayName } from "@/lib/i18n";
import { MIN_SAMPLE, slotOf, LEVEL_LABEL, type CarRank, type GuideResult } from "@/lib/seatCar";
import type { Congestion } from "@/lib/congestion";
import { carNumbersOf, type LineId } from "@/lib/subway";
import { api, btnGhost, field, useLang, useT } from "../ui";

type Dir = "" | "up" | "down";
type Guide = GuideResult & { congestion: Congestion | null };

/**
 * 탑승 칸·입구 안내. 역과 시간을 고르면 불러온다(첫 화면에서는 요청하지 않는다).
 * 추천은 회원이 남긴 착석 기록으로 계산하며, 기록이 적으면 추천 대신 수집 상태를 보여 준다.
 */
export default function SubwayCarGuide({ line, station, timeGo, days }: { line: LineId; station: string; timeGo: string; days: string }) {
  const t = useT();
  const lang = useLang();
  const selectedDays = useMemo(() => [...days].filter((d) => /^[0-6]$/.test(d)).sort(), [days]);
  const [dir, setDir] = useState<Dir>("");
  const [dow, setDow] = useState<string>("");
  const [data, setData] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [car, setCar] = useState("");
  const [entrance, setEntrance] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const day = dow && selectedDays.includes(dow) ? dow : selectedDays[0] ?? "";
  const slot = slotOf(timeGo);
  const ready = !!station && !!dir && !!day && !!slot;

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
    if (!ready || !car || !/^\d{1,2}$/.test(entrance)) {
      setNote(t("칸과 입구 번호를 먼저 골라 주세요."));
      return;
    }
    setBusy(true);
    setNote("");
    const r = await api("/api/seat/car/feedback", "POST", { line, station, dir, dow: day, slot, car, entrance, seated });
    setBusy(false);
    if (!r.ok) return setNote(t(r.error));
    setNote(t("알려 주셔서 고마워요. 다음 안내에 반영돼요."));
    setEntrance("");
  };

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-white p-4" data-block-id="S062" data-block-name="탑승 칸 안내">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{t("앉을 가능성이 높은 칸")}</p>
        <p className="text-[13px] leading-relaxed text-sub">{t("지나간 착석 기록으로 계산한 참고 정보이며, 실제 좌석은 보장되지 않아요.")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-sub">
          {t("방향")}
          <select className={`${field} mt-1`} value={dir} onChange={(e) => setDir(e.target.value as Dir)}>
            <option value="">{t("고르세요")}</option>
            <option value="up">{t("상행")}</option>
            <option value="down">{t("하행")}</option>
          </select>
        </label>
        <label className="block text-sm text-sub">
          {t("요일")}
          <select className={`${field} mt-1`} value={day} onChange={(e) => setDow(e.target.value)} disabled={!selectedDays.length}>
            {selectedDays.map((d) => (
              <option key={d} value={d}>{dayName(lang, Number(d))}</option>
            ))}
          </select>
        </label>
      </div>

      {!dir && <p className="text-[14px] text-sub">{t("방향을 고르면 칸과 입구를 안내해 드려요.")}</p>}

      {ready && data?.congestion && <CongestionCard c={data.congestion} dayLabel={dayName(lang, Number(day))} slot={slot} dirLabel={dir === "up" ? t("상행") : t("하행")} />}
      {ready && data && !data.congestion && <p className="text-[13px] text-sub">{t("이 역·방향의 혼잡도 자료가 아직 없어요.")}</p>}

      {ready && loading && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {ready && err && <p className="text-[14px] text-warn">{err}</p>}

      {ready && data?.status === "collecting" && (
        <div className="space-y-2 rounded-2xl bg-bg px-4 py-3">
          <p className="text-[15px] font-semibold text-ink">{t("데이터 수집 중")}</p>
          <p className="text-[13px] leading-relaxed text-sub">
            {t("이 시간대 착석 기록")} {data.total}/{MIN_SAMPLE}{t("건")}. {t("기록이 쌓이면 칸을 추천해 드려요.")}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-violet" style={{ width: `${Math.min(100, (data.total / MIN_SAMPLE) * 100)}%` }} />
          </div>
        </div>
      )}

      {ready && top && data && data.status === "ready" && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {data.ranked.map((r, i) => (
              <li key={`${r.car}-${r.entrance}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {i === 0 && <span className="mr-1.5 text-violet">{t("추천")}</span>}
                    {r.car}{t("호차")} · {t("입구")} {r.entrance}{t("번")}
                  </p>
                  <p className="num text-[12px] text-sub">{t("착석 기록")} {r.seated}/{r.n}{t("건")}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${r.level === "high" ? "bg-violetSoft text-violet" : "bg-bg text-sub"}`}>
                  {t(LEVEL_LABEL[r.level])}
                </span>
              </li>
            ))}
          </ul>
          <CarPlan car={top.car} />
        </div>
      )}

      {ready && data?.status === "ready" && !top && <p className="text-[14px] text-sub">{t("아직 뚜렷한 칸이 없어요. 기록이 더 쌓이면 보여 드릴게요.")}</p>}

      {ready && (
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink">{t("방금 탄 곳 알려 주기")}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-sub">
              {t("칸")}
              <select className={`${field} mt-1`} value={car} onChange={(e) => setCar(e.target.value)}>
                <option value="">{t("고르세요")}</option>
                {carNumbersOf(line).map((c) => (
                  <option key={c} value={c}>{c}{t("호차")}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-sub">
              {t("입구 번호")}
              <input className={`${field} num mt-1`} inputMode="numeric" maxLength={2} placeholder={t("예: 3")} value={entrance} onChange={(e) => setEntrance(e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={btnGhost} disabled={busy} onClick={() => send(true)}>{t("앉았어요")}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => send(false)}>{t("못 앉았어요")}</button>
          </div>
          {note && <p className="text-[13px] text-sub">{note}</p>}
        </div>
      )}
    </section>
  );
}

/** 같은 역·방향·요일·시간대의 혼잡도(서울교통공사 2026년 6월 자료). 칸 추천과 따로 보여 준다. */
function CongestionCard({ c, dayLabel, slot, dirLabel }: { c: Congestion; dayLabel: string; slot: string; dirLabel: string }) {
  const t = useT();
  return (
    <div className="space-y-2 rounded-2xl bg-bg px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-sub">{t("혼잡도")} <span className="num text-[18px] font-semibold text-ink">{c.pct}%</span></p>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${c.level === "low" ? "bg-white text-sub" : "bg-violetSoft text-violet"}`}>{t(c.label)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-violet" style={{ width: `${Math.min(100, c.pct)}%` }} />
      </div>
      <p className="text-[12px] leading-relaxed text-sub">
        {dayLabel} {slot}~ · {dirLabel} {t("기준")} · {t("서울교통공사 2026년 6월 자료")}
      </p>
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
