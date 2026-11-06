"use client";
import { needPush } from "@/lib/pushGate";
import { useEffect, useState } from "react";
import { type Place, type Post } from "@/lib/types";
import PlaceField from "./PlaceField";
import { ALL_LINES, lineColor } from "@/lib/lineMeta";
import { Bubble, useHintTap, Card, Sheet, api, btnGhost, btnPrimary, btnRider, btnSubway, currentHere, useLang, useT, when } from "./ui";

/** 시각(ms)을 datetime-local 입력 값(기기 현지 시간)으로 */
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * CALL 출발 시각 고르기(2026-11-06 사용자 지시: 카풀은 택시가 아니라 시간 여유가 필요 — 최소 30분 뒤).
 * [30분 뒤][1시간 뒤][2시간 뒤][직접 고르기]. 고른 시각(ms)을 돌려준다.
 */
const CALL_LEADS: [number, string][] = [[30, "30분 뒤"], [60, "1시간 뒤"], [120, "2시간 뒤"]];
function CallTime({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  const t = useT();
  const lang = useLang();
  const [lead, setLead] = useState<number>(30);
  const [custom, setCustom] = useState("");
  const pick = (m: number) => { setLead(m); onChange(Date.now() + m * 60_000); };
  // '30분 뒤'처럼 고른 경우, 창을 열어 둔 사이 시간이 흘러도 늘 지금부터 그만큼 뒤가 되게 맞춘다
  useEffect(() => {
    if (!lead) return;
    const id = setInterval(() => onChange(Date.now() + lead * 60_000), 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead]);
  return (
    <div data-block-id="F445" data-block-name="CALL 출발 시각" className="space-y-2">
      <p className="text-[14px] font-semibold text-ink">{t("언제 출발할까요?")}</p>
      <div role="radiogroup" aria-label={t("출발 시각")} className="grid grid-cols-4 gap-1.5">
        {CALL_LEADS.map(([m, l]) => (
          <button key={m} type="button" role="radio" aria-checked={lead === m} onClick={() => pick(m)}
            className={`min-h-[44px] rounded-xl border px-1 text-[14px] ${lead === m ? "border-mint bg-mintSoft font-semibold text-mint" : "border-line bg-white text-sub"}`}>{t(l)}</button>
        ))}
        <button type="button" role="radio" aria-checked={lead === 0} onClick={() => { setLead(0); const v = custom || toLocalInput(Date.now() + 60 * 60_000); setCustom(v); onChange(new Date(v).getTime()); }}
          className={`min-h-[44px] rounded-xl border px-1 text-[14px] ${lead === 0 ? "border-mint bg-mintSoft font-semibold text-mint" : "border-line bg-white text-sub"}`}>{t("직접 고르기")}</button>
      </div>
      {lead === 0 && (
        <input type="datetime-local" className="num w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] text-ink outline-none focus:border-mint"
          min={toLocalInput(Date.now() + 30 * 60_000)} value={custom} onChange={(e) => { setCustom(e.target.value); onChange(new Date(e.target.value).getTime()); }} />
      )}
      <p className="text-[13px] text-sub">{t("카풀은 운전자도 일정이 있어 최소 30분 뒤부터 부를 수 있어요.")} {t("출발")} {when(value, lang)} · {t("출발 15분 전까지 수락하는 분이 없으면 호출이 저절로 끝나요.")}</p>
    </div>
  );
}

/** 연락 방법·아이디가 없을 때 안내하고, 프로필(내 정보)의 입력란으로 바로 이동시킨다. */
function RegisterContact({ onGoProfile }: { onGoProfile?: () => void }) {
  const t = useT();
  return (
    <div className="space-y-2 rounded-2xl bg-warnSoft px-4 py-3">
      <p className="text-[14px] leading-relaxed text-warn">{t("CALL을 쓰려면 프로필에서 연락 방법과 아이디를 먼저 등록해 주세요.")}</p>
      {onGoProfile && (
        <button type="button" data-block-id="B280" data-block-name="프로필에서 연락 방법 등록" className="w-full rounded-xl bg-white py-2.5 text-[15px] font-semibold text-accent" onClick={onGoProfile}>
          {t("프로필에서 등록하기")}
        </button>
      )}
    </div>
  );
}

/** 하단 메뉴 바로 위, 가운데에 떠 있는 CALL 버튼 (홈 화면에서만 보인다) */
/** onSubway: 지하철 메뉴의 화면(매칭·앉을 칸 찾기)으로 이동, onSubwaySetup: 출퇴근 정보 창(지하철 칸)을 연다. */
type SubwayGo = { onSubway?: (view: "seat" | "match" | "edit") => void; onSubwaySetup?: () => void };

type SubwayPlanLite = { boardLine: string; board: string; alightLine: string; alight: string; back?: boolean };
type SubwayRide = { trip: "go" | "back"; line: string; board: string; alight: string; time: string };

/**
 * 지금 탈 노선·역. 반대 방면을 등록했으면 오후 2시부터 반대 방면. 오늘 지하철 메뉴에서 바꾼 값(이 기기, modu.subwayToday)이 있으면 그 값을 쓴다.
 */
function rideNow(p: SubwayPlanLite): SubwayRide {
  const now = new Date(Date.now() + 9 * 3600_000);
  const time = now.toISOString().slice(11, 16);
  const date = now.toISOString().slice(0, 10);
  const trip: "go" | "back" = p.back && now.getUTCHours() >= 14 ? "back" : "go";
  const base = trip === "go" ? { line: p.boardLine, board: p.board, alight: p.alight } : { line: p.alightLine, board: p.alight, alight: p.board };
  try {
    const v = JSON.parse(localStorage.getItem("modu.subwayToday") ?? "null") as { date?: string; kind?: string; line?: string; board?: string; alight?: string } | null;
    if (v && v.date === date && v.kind === trip && v.line && v.board && v.alight) return { trip, line: v.line, board: v.board, alight: v.alight, time };
  } catch {
    /* 무시 */
  }
  return { trip, ...base, time };
}

export function FloatingCall({ toast, onGoProfile, onSubway, onSubwaySetup }: { toast: (m: string) => void; onGoProfile?: () => void } & SubwayGo) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const hintTap = useHintTap();
  return (
    <>
      <div className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] left-1/2 z-30 w-max max-w-[260px] -translate-x-1/2">
        <Bubble blockId="C933" pointer="bottom" align="center">{t("주변 운전자에게 바로 호출을 보내요. 하루 횟수가 정해져 있어요.")}</Bubble>
      </div>
      <button type="button" data-block-id="B217" data-block-name="CALL" aria-label="CALL" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 rounded-full bg-mint px-8 py-3.5 text-[16px] font-bold tracking-wide text-white shadow-card active:opacity-80" onClick={() => { if (hintTap("C933")) return; setOpen(true); }}>
        CALL
      </button>
      {open && <CallSheet onClose={() => setOpen(false)} toast={toast} onGoProfile={onGoProfile} onSubway={onSubway} onSubwaySetup={onSubwaySetup} />}
    </>
  );
}

type Step = "choose" | "pick" | "quick" | "confirm" | "taxi" | "subway";

function CallSheet({ onClose, toast, onGoProfile, onSubway, onSubwaySetup }: { onClose: () => void; toast: (m: string) => void; onGoProfile?: () => void } & SubwayGo) {
  const t = useT();
  const [subwayBusy, setSubwayBusy] = useState(false);
  // 지하철 호출 확인: "○○역에서 지금 타서 ○○역에서 내리시나요?"
  const [ride, setRide] = useState<SubwayRide | null>(null);
  // 지하철 앉아가기: 등록이 없으면 입력해야 이용할 수 있다고 알리고 출퇴근 정보 창(지하철 칸)을 연다.
  // 등록이 있으면 오늘 탈 노선·역을 팝업에서 확인받는다(오늘 지하철 메뉴에서 바꾼 값이 있으면 그 값).
  const subway = async () => {
    setSubwayBusy(true);
    const r = await api<{ plan: SubwayPlanLite | null }>("/api/seat/plan");
    setSubwayBusy(false);
    if (!r.ok) return toast(t(r.error));
    if (!r.data.plan) {
      onClose();
      toast(t("지하철 출퇴근 정보를 입력해야 앉아가기를 이용할 수 있어요."));
      return onSubwaySetup?.();
    }
    setRide(rideNow(r.data.plan));
    setStep("subway");
  };
  // 맞아요: 지금 같은 노선·같은 방향 승차자가 있으면 매칭, 없으면 앉을 칸 찾기로 간다.
  const subwayGo = async () => {
    if (!ride) return;
    setSubwayBusy(true);
    const q = new URLSearchParams({ trip: ride.trip, line: ride.line, board: ride.board, alight: ride.alight, next: "" }).toString();
    const [a, b] = await Promise.all([
      api<{ candidates: unknown[] }>(`/api/seat/match?list=ahead&${q}`),
      api<{ candidates: unknown[] }>(`/api/seat/match?list=before&${q}`),
    ]);
    setSubwayBusy(false);
    const riders = (a.ok ? a.data.candidates.length : 0) + (b.ok ? b.data.candidates.length : 0);
    onClose();
    if (riders > 0) {
      toast(`${t("지금 같은 방향 승차자")} ${riders}${t("명이 있어요.")}`);
      return onSubway?.("match");
    }
    toast(t("지금 같은 방향 승차자가 없어요. 앉을 칸부터 찾아보세요."));
    onSubway?.("seat");
  };
  const [step, setStep] = useState<Step>("choose");
  const [mine, setMine] = useState<Post[] | null>(null);
  const [picked, setPicked] = useState<Post | null>(null);
  const [departAt, setDepartAt] = useState(() => Date.now() + 30 * 60_000);
  const [radius, setRadius] = useState<number | null>(null);
  const [cost, setCost] = useState<number>(0);
  const [ready, setReady] = useState<boolean | null>(null);
  const [contactType, setContactType] = useState("");
  const [busy, setBusy] = useState(false);
  const [callsLeft, setCallsLeft] = useState<number | null>(null);
  const [callsLimit, setCallsLimit] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [band, setBand] = useState<string | null>(null);
  const bandText: Record<string, string> = {
    "0": t("주변 운전자 없음"),
    "1-2": t("주변 운전자 1~2명"),
    "3-5": t("주변 운전자 3~5명"),
    "6+": t("주변 운전자 6명 이상"),
  };

  useEffect(() => {
    api<{ radiusKm: number; cost: number; ready: boolean; contactType: string; callsLeft: number | null; callsLimit: number | null }>("/api/call").then((r) => {
      if (!r.ok) return;
      setRadius(r.data.radiusKm);
      setCost(r.data.cost);
      setReady(r.data.ready);
      setContactType(r.data.contactType);
      setCallsLeft(r.data.callsLeft);
      setCallsLimit(r.data.callsLimit);
    });
  }, []);

  const pickStep = async () => {
    if (ready === false) return;
    // 등록된 내 글이 없으면 도착지만 고르는 빠른 호출로 바로 간다.
    if (mine) return setStep(mine.length > 0 ? "pick" : "quick");
    setStep("pick");
    const r = await api<{ posts: Post[] }>("/api/posts?mine=1");
    if (!r.ok) return toast(t(r.error));
    // 같은 출발지·도착지 글은 한 건만 보여 준다(최신 글 우선). 호출은 그 글 기준으로 나간다.
    const seen = new Set<string>();
    const list = r.data.posts.filter((p) => {
      if (p.status !== "open" || p.originLat == null || p.originLng == null) return false;
      const key = `${p.origin}|${p.dest}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setMine(list);
    if (list.length === 0) setStep("quick");
  };

  const taxi = () => setStep("taxi");

  /** 호출하는 순간의 현재 위치를 받는다. 위치를 못 받으면 호출하지 않는다(크레딧도 차감되지 않는다). */
  const locate = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!("geolocation" in navigator)) {
        toast(t("이 기기는 위치 확인을 지원하지 않아요."));
        return resolve(null);
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => {
          toast(t(err.code === err.PERMISSION_DENIED ? "위치 권한을 허용해 주세요." : "현재 위치를 찾지 못했어요."));
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });

  // 열 때 현재 위치를 받아 주변 운전자 수(구간)를 보여 준다. 0명이면 호출 버튼을 막는다.
  useEffect(() => {
    let alive = true;
    locate().then((here) => {
      if (!here || !alive) return;
      api<{ band: string | null }>(`/api/call?lat=${here.lat}&lng=${here.lng}`).then((r) => {
        if (alive && r.ok) setBand(r.data.band);
      });
    });
    return () => {
      alive = false;
    };
    // 처음 한 번만 확인한다(호출할 때 위치를 다시 받는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (!picked) return;
    if (needPush()) return; // 알림이 꺼져 있으면 먼저 켜게 한다
    setBusy(true);
    const here = await locate();
    if (!here) return setBusy(false);
    const r = await api<{ notified: number; radiusKm: number }>("/api/call", "POST", { postId: picked.id, lat: here.lat, lng: here.lng, departAt });
    setBusy(false);
    if (!r.ok) {
      setErr(t(r.error));
      return toast(t(r.error));
    }
    setErr("");
    if (callsLeft !== null) setCallsLeft(Math.max(0, callsLeft - 1));
    const who = r.data.notified > 0 ? `${t("운전자")} ${r.data.notified.toLocaleString("ko-KR")}${t("명에게 알림을 보냈어요.")}` : t("반경 안에 알릴 운전자가 없어요.");
    toast(cost > 0 ? `${who} -${cost.toLocaleString("ko-KR")} ${t("크레딧")}` : who);
    onClose();
  };

  return (
    <Sheet title="CALL" blockId="S011" onClose={onClose}>
      {step === "choose" && (
        <div className="space-y-3">
          <button type="button" data-block-id="B218" data-block-name="택시동승 호출" className={btnGhost} onClick={taxi}>{t("택시동승 호출")}</button>
          <div className="space-y-1.5">
            <button type="button" data-block-id="B222" data-block-name="지하철 앉아가기 호출" className="w-full rounded-xl border border-violet bg-violetSoft px-4 py-3 text-[16px] font-semibold text-violet disabled:opacity-70" disabled={subwayBusy} onClick={subway}>
              {subwayBusy ? t("확인 중…") : t("지하철 앉아가기")}
            </button>
            <p className="px-1 text-[13px] leading-relaxed text-sub">{t("지하철 출퇴근 정보를 입력하면 이용할 수 있어요.")}</p>
          </div>
          {ready === false && <RegisterContact onGoProfile={onGoProfile} />}
          {band !== null && (
            <p data-block-id="C500" data-block-name="주변 운전자 수" className="rounded-2xl bg-bg px-4 py-3 text-[15px] font-semibold text-ink">
              {t("현재 위치 기준")} · {bandText[band] ?? ""}
            </p>
          )}
          {callsLeft === 0 ? (
            <p className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{t("오늘 CALL 횟수를 모두 썼어요. 내일 다시 이용해 주세요.")}</p>
          ) : (
            callsLeft !== null && callsLimit !== null && <p className="px-1 text-[14px] text-sub">{t("오늘 남은 CALL")} {callsLeft}/{callsLimit}</p>
          )}
          <button type="button" data-block-id="B219" data-block-name="주변 호출" className={btnRider} disabled={ready === false || callsLeft === 0 || band === "0"} onClick={pickStep}>{t("주변 운전자 호출")}</button>
        </div>
      )}
      {step === "pick" && (
        <div className="space-y-3">
          <p className="text-sm text-sub">{t("호출에 쓸 내 카풀 글을 골라 주세요.")}</p>
          {mine === null && <div className="h-20 animate-pulse rounded-2xl bg-white" aria-hidden />}
          {mine?.length === 0 && (
            <div className="space-y-2 rounded-2xl bg-bg p-4">
              <p className="text-[15px] font-semibold">{t("CALL은 등록된 카풀이 있어야 쓸 수 있어요.")}</p>
              <p className="text-[14px] leading-relaxed text-sub">{t("먼저 카풀을 등록해 주세요. 출발지가 있는 열린 글 중 하나를 골라 호출할 수 있어요.")}</p>
            </div>
          )}
          <ul data-block-id="C057" data-block-name="내 글 목록" className="space-y-2">
            {mine?.map((p) => (
              <li key={p.id}>
                <button type="button" data-block-id="B220" data-block-name="호출할 글 고르기" className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-left text-[15px]" onClick={() => { setPicked(p); setStep("confirm"); }}>
                  <span className="block truncate font-semibold">{p.origin} → {p.dest}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={btnGhost} onClick={() => setStep("choose")}>{t("뒤로")}</button>
        </div>
      )}
      {step === "quick" && (
        <QuickCall
          cost={cost}
          radius={radius}
          callsLeft={callsLeft}
          onBack={() => setStep("choose")}
          onDone={onClose}
          toast={toast}
        />
      )}
      {step === "subway" && ride && (
        <div className="space-y-4" data-block-id="S012" data-block-name="지하철 호출 확인">
          <div className="space-y-2 rounded-2xl bg-violetSoft px-4 py-4">
            <p className="text-[13px] font-semibold text-violet">{t("지하철 앉아가기")}</p>
            <p className="text-[17px] font-bold leading-snug text-ink">
              <span className="mr-1.5 rounded-md px-1.5 py-0.5 align-middle text-[12px] font-bold" style={{ background: lineColor(ride.line).bg, color: lineColor(ride.line).text }}>{t(ALL_LINES.find((l) => l.id === ride.line)?.name ?? ride.line)}</span>
              {ride.board} → {ride.alight}
            </p>
            <p className="text-[15px] leading-relaxed text-ink">
              {`${ride.board}${t("역에서")} ${t("지금")}(${ride.time}) ${t("타서")} ${ride.alight}${t("역에서 내리시나요?")}`}
            </p>
          </div>
          <button type="button" data-block-id="B223" data-block-name="지하철 호출 진행" className={btnSubway} disabled={subwayBusy} onClick={subwayGo}>
            {subwayBusy ? t("확인 중…") : t("맞아요, 진행")}
          </button>
          <button type="button" data-block-id="B224" data-block-name="오늘만 수정" className={btnGhost} disabled={subwayBusy} onClick={() => { onClose(); onSubway?.("edit"); }}>
            {t("아니요, 오늘만 수정")}
          </button>
          <p className="px-1 text-[12px] leading-relaxed text-sub">{t("오늘만 수정은 지하철 메뉴에서 노선·역을 바꿔요. 설정의 등록 정보는 그대로예요.")}</p>
          <button type="button" className="w-full py-2 text-[14px] text-sub" onClick={() => setStep("choose")}>{t("뒤로")}</button>
        </div>
      )}
      {step === "taxi" && <TaxiForm onBack={() => setStep("choose")} onDone={onClose} toast={toast} onGoProfile={onGoProfile} />}
      {step === "confirm" && picked && (
        <div className="space-y-3">
          <Card className="space-y-1 p-4">
            <p className="font-semibold">{picked.origin} → {picked.dest}</p>
            <p className="text-sm text-sub">
              {radius !== null ? `${t("현재 위치 기준")} ${t("반경")} ${radius}km ${t("안의 운전자에게 알림을 보냅니다.")}` : t("현재 위치 주변의 운전자에게 알림을 보냅니다.")}
            </p>
            {cost > 0 ? (
              <>
                <p className="text-sm font-semibold text-warn">{t("CALL은")} {cost.toLocaleString("ko-KR")} {t("크레딧이 차감됩니다.")}</p>
                <p className="text-sm text-sub">{t("응답하는 운전자가 없어도 크레딧은 환불되지 않아요.")}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-mint">{t("CALL은 지금 무료예요.")}</p>
            )}
            <p className="text-sm text-sub">{t("이 글은 고른 출발 시각으로 다시 올라갑니다.")}</p>
            <p className="text-sm text-sub">{t("수락한 운전자에게 내 연락 방법과 아이디가 보여요.")} ({contactType})</p>
          </Card>
          <CallTime value={departAt} onChange={setDepartAt} />
          {err && <p role="alert" className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{err}</p>}
          <button type="button" data-block-id="B221" data-block-name="호출 보내기" className={btnRider} disabled={busy || callsLeft === 0} onClick={send}>{busy ? t("처리 중…") : `${t("호출 보내기")} (${cost > 0 ? `${cost.toLocaleString("ko-KR")} ${t("크레딧")}` : t("무료")})`}</button>
          <button type="button" className={btnGhost} onClick={() => setStep("pick")}>{t("뒤로")}</button>
        </div>
      )}
    </Sheet>
  );
}

/** 빠른 호출: 내 글 없이 출발지(기본 현재 위치)·도착지를 고르고, 감사 표시를 정해 바로 호출한다. */
function QuickCall({ cost, radius, callsLeft, onBack, onDone, toast }: { cost: number; radius: number | null; callsLeft: number | null; onBack: () => void; onDone: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [origin, setOrigin] = useState<Place>({ name: "", lat: null, lng: null });
  const [dest, setDest] = useState<Place>({ name: "", lat: null, lng: null });
  const [gifts, setGifts] = useState<{ id: string; label: string }[]>([]);
  const [gift, setGift] = useState("");
  const [departAt, setDepartAt] = useState(() => Date.now() + 30 * 60_000);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ keywords: { gift: { id: string; label: string }[] } }>("/api/keywords").then((r) => {
      if (r.ok) setGifts(r.data.keywords.gift);
    });
  }, []);

  const send = async () => {
    setErr("");
    if (!dest.name.trim()) return setErr(t("도착지를 골라 주세요."));
    if (needPush()) return;
    setBusy(true);
    const here = await currentHere();
    if (!here) {
      setBusy(false);
      return setErr(t("현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요."));
    }
    const r = await api<{ notified: number }>("/api/call", "POST", {
      quick: true,
      origin: origin.name.trim() || t("현재 위치"),
      dest: dest.name,
      oLat: origin.lat,
      oLng: origin.lng,
      dLat: dest.lat,
      dLng: dest.lng,
      gift,
      lat: here.lat,
      lng: here.lng,
      departAt,
    });
    setBusy(false);
    if (!r.ok) return setErr(t(r.error));
    toast(r.data.notified > 0 ? `${t("운전자")} ${r.data.notified.toLocaleString("ko-KR")}${t("명에게 알림을 보냈어요.")}` : t("반경 안에 알릴 운전자가 없어요."));
    onDone();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-sub">{t("등록된 카풀이 없어도 부를 수 있어요. 출발지는 현재 위치가 기본이고, 도착지와 출발 시각만 고르면 돼요.")}</p>
      <PlaceField blockId="F105" label={t("출발지")} placeholder={t("현재 위치 (직접 입력도 가능)")} value={origin} onChange={setOrigin} locate toast={toast} />
      <PlaceField blockId="F106" label={t("도착지")} placeholder={t("예: 여의도역 2번 출구")} value={dest} onChange={setDest} toast={toast} />
      <div className="space-y-2">
        <p className="text-[14px] font-semibold text-ink">{t("감사 표시")}</p>
        <div role="radiogroup" aria-label={t("감사 표시")} className="flex flex-wrap gap-2">
          {[{ id: "", label: t("없음") }, ...gifts].map((g) => (
            <button
              key={g.id || "none"}
              type="button"
              role="radio"
              aria-checked={gift === g.id}
              onClick={() => setGift(g.id)}
              className={`min-h-0 rounded-full border px-4 py-2 text-[15px] ${gift === g.id ? "border-mint bg-mintSoft font-semibold text-mint" : "border-line bg-white text-sub"}`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <CallTime value={departAt} onChange={setDepartAt} />
      <Card className="space-y-1 p-4">
        <p className="text-sm text-sub">
          {radius !== null ? `${t("현재 위치 기준")} ${t("반경")} ${radius}km ${t("안의 운전자에게 알림을 보냅니다.")}` : t("현재 위치 주변의 운전자에게 알림을 보냅니다.")}
        </p>
        <p className={`text-sm font-semibold ${cost > 0 ? "text-warn" : "text-mint"}`}>
          {cost > 0 ? `${t("CALL은")} ${cost.toLocaleString("ko-KR")} ${t("크레딧이 차감됩니다.")}` : t("CALL은 지금 무료예요.")}
        </p>
      </Card>
      {err && <p role="alert" className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{err}</p>}
      <button type="button" data-block-id="B281" data-block-name="빠른 호출 보내기" className={btnRider} disabled={busy || callsLeft === 0} onClick={send}>
        {busy ? t("처리 중…") : `${t("빠른 호출 보내기")} (${cost > 0 ? `${cost.toLocaleString("ko-KR")} ${t("크레딧")}` : t("무료")})`}
      </button>
      <button type="button" className={btnGhost} onClick={onBack}>{t("뒤로")}</button>
    </div>
  );
}

/** 받은 호출(알림을 누르면 열린다). 수락하면 호출한 회원의 연락 방법과 아이디를 보여 준다. */
export function IncomingCall({ callId, onClose, toast }: { callId: string; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [info, setInfo] = useState<{ origin: string; dest: string; callerCode: string; accepted: boolean; departAt: number | null; ended: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [contact, setContact] = useState<{ contactType: string; contact: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ origin: string; dest: string; callerCode: string; accepted: boolean; departAt: number | null; ended: boolean }>(`/api/call?callId=${encodeURIComponent(callId)}`).then((r) => {
      if (!r.ok) return setErr(t(r.error));
      setInfo(r.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const accept = async () => {
    setBusy(true);
    const r = await api<{ contactType: string; contact: string }>("/api/call", "POST", { action: "accept", callId });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setContact(r.data);
  };

  return (
    <Sheet title={t("받은 호출")} blockId="S131" onClose={onClose}>
      <div className="space-y-3">
        {err && <p className="rounded-2xl bg-bg p-4 text-[14px] text-warn">{err}</p>}
        {info && (
          <Card className="space-y-1 p-4">
            <p className="font-semibold">{info.origin} → {info.dest}</p>
            {info.departAt && <p className="text-[15px] font-semibold text-ink">{when(info.departAt, lang)} {t("출발")}</p>}
            <p className="text-sm text-sub">{t("호출한 회원")} {info.callerCode}</p>
          </Card>
        )}
        {info && info.ended && !contact && <p className="rounded-2xl bg-bg p-4 text-[14px] text-sub">{t("이미 끝난 호출이에요.")}</p>}
        {info && !info.ended && !contact && (
          <>
            <p className="text-sm text-sub">{t("수락하면 호출한 회원의 연락 방법과 아이디가 보여요.")}</p>
            <button type="button" data-block-id="B275" data-block-name="호출 수락" className={btnPrimary} disabled={busy} onClick={accept}>{busy ? t("처리 중…") : t("수락하고 연락처 보기")}</button>
          </>
        )}
        {contact && (
          <Card className="space-y-1 p-4">
            <p className="text-sm text-sub">{t("수락 완료")}</p>
            <p className="font-semibold">{t("연락 방법")}: {contact.contactType}</p>
            <p className="font-mono text-[16px] font-semibold">{t("아이디")}: {contact.contact}</p>
          </Card>
        )}
      </div>
    </Sheet>
  );
}

/**
 * 택시동승 호출 입력. 출발지·도착지·출발 시각·동승 조건을 적는다. 요금은 입력하지 않는다.
 * 보낼 때 현재 위치를 받아 근처 운전자·탑승자에게 알린다. 무료, 하루 2회.
 */
function TaxiForm({ onBack, onDone, toast, onGoProfile }: { onBack: () => void; onDone: () => void; toast: (m: string) => void; onGoProfile?: () => void }) {
  const t = useT();
  const [origin, setOrigin] = useState<Place>({ name: "", lat: null, lng: null });
  const [dest, setDest] = useState<Place>({ name: "", lat: null, lng: null });
  const [at, setAt] = useState(() => toLocalInput(Date.now() + 30 * 60_000));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    api<{ ready: boolean; left: number; limit: number }>("/api/taxicall").then((r) => {
      if (!r.ok) return;
      setReady(r.data.ready);
      setLeft(r.data.left);
      setLimit(r.data.limit);
    });
  }, []);

  const send = async () => {
    setErr("");
    if (!origin.name.trim() || !dest.name.trim()) return setErr(t("출발지와 도착지를 적어 주세요."));
    if (note.trim().length < 2) return setErr(t("동승 조건을 적어 주세요."));
    setBusy(true);
    const here = await currentHere();
    if (!here) {
      setBusy(false);
      return setErr(t("현재 위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요."));
    }
    const r = await api<{ notified: number }>("/api/taxicall", "POST", {
      origin: origin.name,
      dest: dest.name,
      departAt: new Date(at).getTime(),
      note,
      lat: here.lat,
      lng: here.lng,
    });
    setBusy(false);
    if (!r.ok) return setErr(t(r.error));
    toast(t("택시동승 호출을 보냈어요."));
    onDone();
  };

  const blocked = ready === false || left === 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-sub">{t("함께 탈 택시의 출발지·도착지와 동승 조건을 적어 주세요. 근처 운전자와 탑승자 모두에게 알려요.")}</p>
      {ready === false && <RegisterContact onGoProfile={onGoProfile} />}
      {left === 0 ? (
        <p className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{t("오늘 택시동승 호출 횟수를 모두 썼어요. 내일 다시 이용해 주세요.")}</p>
      ) : (
        left !== null && limit !== null && <p className="px-1 text-[14px] text-sub">{t("오늘 남은 택시동승 호출")} {left}/{limit} · {t("무료")}</p>
      )}
      <PlaceField blockId="F101" label={t("출발지")} placeholder={t("예: 수원 영통역")} value={origin} onChange={setOrigin} locate toast={toast} />
      <PlaceField blockId="F102" label={t("도착지")} placeholder={t("예: 강남역")} value={dest} onChange={setDest} toast={toast} />
      <label className="block text-sm text-sub">
        {t("출발 시각")}
        <input data-block-id="F103" className="w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] text-ink outline-none focus:border-accent num mt-1" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </label>
      <label className="block text-sm text-sub">
        {t("동승 조건")}
        <textarea data-block-id="F104" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] text-ink outline-none focus:border-accent" rows={3} maxLength={200} placeholder={t("예: 2명이 같이 탈 수 있어요, 짐은 작은 가방 하나, 강남 방면 합승 가능")} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && <p role="alert" className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{err}</p>}
      <button type="button" data-block-id="B279" data-block-name="택시동승 호출 보내기" className={btnPrimary} disabled={busy || blocked} onClick={send}>{busy ? t("처리 중…") : t("택시동승 호출 보내기")}</button>
      <button type="button" className={btnGhost} onClick={onBack}>{t("뒤로")}</button>
    </div>
  );
}

/** 받은 택시동승 호출. 조건을 보고 수락하면 호출한 회원의 연락 방법과 아이디를 보여 준다. */
export function IncomingTaxiCall({ callId, onClose, toast }: { callId: string; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [info, setInfo] = useState<{ origin: string; dest: string; departAt: number; note: string; callerCode: string } | null>(null);
  const [err, setErr] = useState("");
  const [contact, setContact] = useState<{ contactType: string; contact: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ origin: string; dest: string; departAt: number; note: string; callerCode: string }>(`/api/taxicall?callId=${encodeURIComponent(callId)}`).then((r) => {
      if (!r.ok) return setErr(t(r.error));
      setInfo(r.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const accept = async () => {
    setBusy(true);
    const r = await api<{ contactType: string; contact: string }>("/api/taxicall", "POST", { action: "accept", callId });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setContact(r.data);
  };

  return (
    <Sheet title={t("받은 택시동승 호출")} blockId="S132" onClose={onClose}>
      <div className="space-y-3">
        {err && <p className="rounded-2xl bg-bg p-4 text-[14px] text-warn">{err}</p>}
        {info && (
          <Card className="space-y-2 p-4">
            <p className="font-semibold">{info.origin} → {info.dest}</p>
            <p className="text-sm text-sub">{t("출발 시각")} {when(info.departAt, lang)}</p>
            <p className="text-[15px] leading-relaxed text-ink">{t("동승 조건")}: {info.note}</p>
            <p className="text-sm text-sub">{t("호출한 회원")} {info.callerCode}</p>
          </Card>
        )}
        {info && !contact && (
          <>
            <p className="text-sm text-sub">{t("수락하면 호출한 회원의 연락 방법과 아이디가 보여요.")}</p>
            <button type="button" data-block-id="B278" data-block-name="택시동승 호출 수락" className={btnPrimary} disabled={busy} onClick={accept}>{busy ? t("처리 중…") : t("수락하고 연락처 보기")}</button>
          </>
        )}
        {contact && (
          <Card className="space-y-1 p-4">
            <p className="text-sm text-sub">{t("수락 완료")}</p>
            <p className="font-semibold">{t("연락 방법")}: {contact.contactType}</p>
            <p className="font-mono text-[16px] font-semibold">{t("아이디")}: {contact.contact}</p>
          </Card>
        )}
      </div>
    </Sheet>
  );
}
