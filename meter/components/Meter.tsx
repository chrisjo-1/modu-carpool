"use client";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Preset } from "@/lib/config";
import { calcFare, haversine, nextStep, nightRate, perPerson, slowEq, won } from "@/lib/fare";
import { Card, Icon, Sheet, btnGhost, btnPrimary, save, type Ride, type Settings } from "./ui";

type Active = { id: string; startedAt: number; eq: number; dist: number; surcharge: number; preset: string };
type Gps = "idle" | "wait" | "ok" | "denied" | "none";
type SheetKind = null | "legal" | "loc" | "settle";

const ACTIVE_KEY = "moca.active";
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

export default function Meter({
  preset,
  settings,
  setSettings,
  notice,
  onSave,
  goSettings,
}: {
  preset: Preset;
  settings: Settings;
  setSettings: (fn: (s: Settings) => Settings) => void;
  notice: string;
  onSave: (r: Ride) => void;
  goSettings: () => void;
}) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [gps, setGps] = useState<Gps>("idle");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [draft, setDraft] = useState<Ride | null>(null);
  const [toast, setToast] = useState("");

  const active = useRef<Active | null>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const lastPos = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const speed = useRef(0); // m/s
  const lastAcct = useRef(0); // 요금에 반영을 마친 시각
  const watchId = useRef<number | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const onPos = useCallback((pos: GeolocationPosition) => {
    setGps("ok");
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const t = pos.timestamp;
    if (accuracy > 50) return;
    const prev = lastPos.current;
    if (!prev) {
      lastPos.current = { lat, lng, t };
      return;
    }
    const dt = (t - prev.t) / 1000;
    if (dt <= 0) return;
    const d = haversine(prev.lat, prev.lng, lat, lng);
    const v = pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : d / dt;
    if (v > 70) {
      lastPos.current = { lat, lng, t }; // 순간 튐(250km/h 초과)은 버린다
      return;
    }
    if (d < Math.max(4, accuracy * 0.5) && v < 1) {
      speed.current = 0; // 정차 중 GPS 흔들림: 기준점 유지
      force();
      return;
    }
    lastPos.current = { lat, lng, t };
    speed.current = v;
    const a = active.current;
    if (a) {
      const now = Date.now();
      const p = presetRef.current;
      a.dist += d;
      if (v * 3.6 >= p.slowKmh) a.eq += d;
      else a.eq += slowEq(p, Math.min(10, Math.max(0, (now - lastAcct.current) / 1000)));
      lastAcct.current = now;
    }
    force();
  }, []);

  const onErr = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) setGps("denied");
  }, []);

  const startWatch = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps("none");
      return;
    }
    if (watchId.current !== null) return;
    setGps((g) => (g === "ok" ? g : "wait"));
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
  }, [onPos, onErr]);

  const lockScreen = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock && active.current) wake.current = await nav.wakeLock.request("screen");
    } catch {
      /* 화면 켜짐 유지를 지원하지 않는 기기 */
    }
  }, []);

  // 마운트: 진행 중이던 주행 복구, 권한이 이미 있으면 GPS 수신 시작
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      const a = raw ? (JSON.parse(raw) as Active) : null;
      if (a && typeof a.startedAt === "number" && Date.now() - a.startedAt < 12 * 3600 * 1000) {
        active.current = a;
        lastAcct.current = Date.now();
        startWatch();
        lockScreen();
        force();
      }
    } catch {
      /* 무시 */
    }
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (s.state === "granted") startWatch();
        if (s.state === "denied") setGps("denied");
      })
      .catch(() => {});
    const onVis = () => {
      if (document.visibilityState === "visible") {
        lastAcct.current = Date.now(); // 화면이 꺼져 있던 시간은 요금에 넣지 않는다
        lockScreen();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      wake.current?.release().catch(() => {});
    };
  }, [startWatch, lockScreen]);

  // 1초 틱: 정차·저속 구간의 시간 요금 반영 + 화면 갱신
  useEffect(() => {
    const id = setInterval(() => {
      const a = active.current;
      if (a) {
        const now = Date.now();
        const p = presetRef.current;
        if (speed.current * 3.6 < p.slowKmh) {
          a.eq += slowEq(p, Math.min(10, Math.max(0, (now - lastAcct.current) / 1000)));
          lastAcct.current = now;
        }
        save(ACTIVE_KEY, a);
      }
      force();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const begin = () => {
    const now = new Date();
    active.current = {
      id: newId(),
      startedAt: now.getTime(),
      eq: 0,
      dist: 0,
      surcharge: settings.night ? nightRate(preset, now) : 0,
      preset: preset.name,
    };
    lastPos.current = null;
    speed.current = 0;
    lastAcct.current = now.getTime();
    save(ACTIVE_KEY, active.current);
    startWatch();
    lockScreen();
    setSheet(null);
    force();
  };

  const onStart = () => {
    if (!settings.consent) return setSheet("legal");
    if (gps === "none") return setToast("이 기기는 위치 측정을 지원하지 않아요.");
    if (gps === "denied") return setToast("위치 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.");
    if (gps !== "ok") return setSheet("loc");
    begin();
  };

  const finish = () => {
    const a = active.current;
    if (!a) return;
    const endedAt = Date.now();
    const total = calcFare(preset, a.eq, a.surcharge);
    setDraft({
      id: a.id,
      startedAt: a.startedAt,
      endedAt,
      distanceM: Math.round(a.dist),
      durationS: Math.round((endedAt - a.startedAt) / 1000),
      total,
      passengers: settings.passengers,
      perPerson: perPerson(total, settings.passengers, settings.includeDriver),
      preset: a.preset,
    });
    active.current = null;
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* 무시 */
    }
    wake.current?.release().catch(() => {});
    wake.current = null;
    setSheet("settle");
  };

  const share = async (r: Ride) => {
    const text =
      `모카 미터기 카풀 정산\n` +
      `주행 ${(r.distanceM / 1000).toFixed(1)}km · ${Math.max(1, Math.round(r.durationS / 60))}분\n` +
      `참고 금액 ${won(r.total)}원 · 동승 ${r.passengers}명\n` +
      `1인 ${won(r.perPerson)}원\n(카풀 비용 분담 참고용)\n${location.origin}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setToast("정산 내용을 복사했어요.");
      }
    } catch {
      /* 공유 취소 */
    }
  };

  const a = active.current;
  const running = !!a;
  const now = new Date();
  const surcharge = a ? a.surcharge : settings.night ? nightRate(preset, now) : 0;
  const eq = a?.eq ?? 0;
  const fare = calcFare(preset, eq, surcharge);
  const each = perPerson(fare, settings.passengers, settings.includeDriver);
  const step = nextStep(preset, eq);
  const elapsed = a ? Math.max(0, Math.round((now.getTime() - a.startedAt) / 1000)) : 0;
  const kmh = running ? Math.round(speed.current * 3.6) : 0;

  const status =
    gps === "denied" ? "위치 권한 꺼짐"
    : gps === "none" ? "위치 미지원"
    : running ? (gps === "ok" ? "주행 중 · GPS 수신" : "주행 중 · GPS 찾는 중")
    : gps === "ok" ? "주행 준비 · GPS 수신"
    : gps === "wait" ? "GPS 찾는 중" : "주행 준비";
  const dotColor = gps === "ok" ? "bg-emerald-500" : gps === "denied" || gps === "none" ? "bg-red-500" : "bg-amber-500";

  return (
    <section data-block-id="S001" data-block-name="미터기" className="space-y-3">
      <button
        data-block-id="B001"
        data-block-name="요금제 안내"
        onClick={goSettings}
        disabled={running}
        className="flex w-full items-center justify-between rounded-2xl bg-accentSoft px-4 text-left text-[15px] text-ink"
      >
        <span>
          <b className="font-semibold">{preset.name}</b> 요율 적용 중
          {surcharge > 0 && <span className="text-accent"> · 심야 할증 {Math.round(surcharge * 100)}%</span>}
        </span>
        <span className="text-sub">{Icon.arrow()}</span>
      </button>

      <Card data-block-id="C001" data-block-name="동승자" className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-sm text-sub">오늘도 안전운행 하세요</p>
          <p className="text-lg font-semibold">{settings.passengers}명과 함께하는 카풀</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="동승자 줄이기"
            className="grid w-11 place-items-center rounded-full bg-bg text-xl"
            onClick={() => setSettings((s) => ({ ...s, passengers: Math.max(1, s.passengers - 1) }))}
          >
            −
          </button>
          <button
            aria-label="동승자 늘리기"
            className="grid w-11 place-items-center rounded-full bg-bg text-xl"
            onClick={() => setSettings((s) => ({ ...s, passengers: Math.min(6, s.passengers + 1) }))}
          >
            +
          </button>
        </div>
      </Card>

      <Card data-block-id="C002" data-block-name="요금 표시" className="overflow-hidden bg-gradient-to-b from-[#F3F7FF] to-white px-5 pb-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-sub">
            {now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}
            <br />
            <span className="num">{now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          </p>
          <span className="flex min-h-0 items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-medium" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${dotColor} ${running ? "live" : ""}`} />
            {status}
          </span>
        </div>

        <p className="mt-5 text-center text-sm font-medium tracking-[0.2em] text-sub">참고 금액</p>
        <p className="num text-center text-[68px] font-bold leading-none text-ink">
          {won(fare)}
          <span className="ml-1 text-2xl font-semibold text-sub">원</span>
        </p>
        <p className="mt-2 text-center text-[17px] text-sub">
          1인 <b className="num font-semibold text-accent">{won(each)}원</b>
          {settings.includeDriver && <span className="text-sm"> (운전자 포함 {settings.passengers + 1}명)</span>}
        </p>

        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[13px] text-sub">
            <span>다음 {won(preset.unitFare)}원까지</span>
            <span className="num">{Math.ceil(step.remain)}m</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, (1 - step.remain / step.span) * 100)}%` }} />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 divide-x divide-line text-center">
          {[
            ["주행 거리", `${((a?.dist ?? 0) / 1000).toFixed(2)}`, "km"],
            ["현재 속도", `${kmh}`, "km/h"],
            ["주행 시간", clock(elapsed), ""],
          ].map(([k, v, u]) => (
            <div key={k}>
              <dt className="text-[13px] text-sub">{k}</dt>
              <dd className="num text-xl font-semibold">
                {v}
                {u && <span className="ml-0.5 text-xs font-normal text-sub">{u}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div data-block-id="C003" data-block-name="법적 고지" className="flex gap-3 rounded-2xl border border-[#F6D9C4] bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-[#7C2D12]">
        <span className="mt-0.5 shrink-0 text-warn">{Icon.alert()}</span>
        <p>
          <b>자가용 유상운송 금지</b> · {notice}{" "}
          <button className="min-h-0 underline" onClick={() => setSheet("legal")}>자세히</button>
        </p>
      </div>

      {running ? (
        <button data-block-id="B003" data-block-name="주행 종료" onClick={finish} className="w-full rounded-2xl border-2 border-ink bg-white px-5 py-4 text-[17px] font-semibold text-ink active:bg-bg">
          주행 종료하고 정산 보기
        </button>
      ) : (
        <button data-block-id="B002" data-block-name="주행 시작" onClick={onStart} className={btnPrimary}>
          주행 시작
        </button>
      )}
      {running && <p className="text-center text-[13px] text-sub">화면을 켜 둔 채로 주행해 주세요. 화면이 꺼지면 측정이 멈춥니다.</p>}

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm text-white shadow-card">
          {toast}
        </div>
      )}

      {sheet === "legal" && (
        <Sheet title="법적 안내" blockId="S010" onClose={() => setSheet(null)}>
          <h2 className="text-2xl font-bold leading-snug">자가용 유상운송 및<br />요금 청구 금지 안내</h2>
          <div className="mt-4 space-y-3 rounded-2xl border border-[#F6D9C4] bg-warnSoft p-4 text-[15px] leading-relaxed text-[#7C2D12]">
            <p>본 서비스는 <b>카풀 비용 분담 계산을 위한 참고용 미터기</b>입니다. 이를 이용해 영리 목적으로 타인에게 요금을 청구하거나 수익을 내는 행위는 「여객자동차 운수사업법」 제81조에 따라 금지되어 있습니다.</p>
            <p>이를 위반해 영업 행위를 하면 같은 법 제90조에 따라 <b>2년 이하의 징역 또는 2,000만 원 이하의 벌금</b>에 처해질 수 있습니다.</p>
            <p className="font-semibold">표시 금액은 실제 택시 요금과 다를 수 있으며, 수익 수단으로 사용하지 마세요.</p>
          </div>
          <div className="mt-5 flex gap-2">
            <button className={`${btnGhost} w-auto shrink-0`} onClick={() => setSheet(null)}>나중에</button>
            <button
              data-block-id="B010"
              data-block-name="동의하고 시작"
              className={btnPrimary}
              onClick={() => {
                if (settings.consent) return setSheet(null);
                setSettings((s) => ({ ...s, consent: true }));
                if (gps === "ok") begin();
                else if (gps === "denied" || gps === "none") {
                  setSheet(null);
                  setToast("위치 권한을 허용한 뒤 다시 시작해 주세요.");
                } else setSheet("loc");
              }}
            >
              {settings.consent ? "확인했어요" : "동의하고 계속"}
            </button>
          </div>
        </Sheet>
      )}

      {sheet === "loc" && (
        <Sheet title="위치 권한" blockId="S011" onClose={() => setSheet(null)}>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accentSoft text-accent">{Icon.pin()}</span>
          <h2 className="mt-4 text-2xl font-bold">위치 정보 권한이 필요해요</h2>
          <p className="mt-2 text-[16px] leading-relaxed text-sub">
            이동 거리와 속도를 실시간으로 재는 데만 사용합니다. 위치는 서버로 보내거나 저장하지 않습니다.
          </p>
          <div className="mt-5 space-y-2">
            <button data-block-id="B011" data-block-name="권한 허용" className={btnPrimary} onClick={begin}>권한 허용하고 주행 시작</button>
            <button className={btnGhost} onClick={() => setSheet(null)}>나중에</button>
          </div>
        </Sheet>
      )}

      {sheet === "settle" && draft && (
        <Sheet title="주행 종료" blockId="S012">
          <h2 className="num text-3xl font-bold">{won(draft.total)}원 정산</h2>
          <p className="mt-1 text-[15px] text-sub">실제 이동 기준 참고 금액입니다.</p>
          <dl className="mt-4 space-y-2 text-[16px]">
            <div className="flex justify-between"><dt className="text-sub">총 주행 거리</dt><dd className="num font-semibold">{(draft.distanceM / 1000).toFixed(2)} km</dd></div>
            <div className="flex justify-between"><dt className="text-sub">주행 시간</dt><dd className="num font-semibold">{clock(draft.durationS)}</dd></div>
            <div className="flex justify-between"><dt className="text-sub">평균 속도</dt><dd className="num font-semibold">{draft.durationS > 0 ? Math.round((draft.distanceM / draft.durationS) * 3.6) : 0} km/h</dd></div>
          </dl>
          <p className="mb-2 mt-5 text-sm text-sub">동승 인원{settings.includeDriver ? " (운전자 별도 포함)" : ""}</p>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                aria-pressed={draft.passengers === n}
                onClick={() => setDraft({ ...draft, passengers: n, perPerson: perPerson(draft.total, n, settings.includeDriver) })}
                className={`rounded-xl border text-[15px] ${draft.passengers === n ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-ink"}`}
              >
                {n}명
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-accentSoft px-5 py-4">
            <span className="text-[15px]">1인당 부담</span>
            <b className="num text-2xl text-accent">{won(draft.perPerson)}원</b>
          </div>
          <div className="mt-5 space-y-2">
            <button data-block-id="B012" data-block-name="공유" className={btnPrimary} onClick={() => share(draft)}>친구에게 공유하기</button>
            <button
              data-block-id="B013"
              data-block-name="기록 저장"
              className={btnGhost}
              onClick={() => {
                onSave(draft);
                setDraft(null);
                setSheet(null);
                setToast("기록에 저장했어요.");
              }}
            >
              기록에 저장하고 닫기
            </button>
            <button className="w-full text-[15px] text-sub underline" onClick={() => { setDraft(null); setSheet(null); }}>저장하지 않고 닫기</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
