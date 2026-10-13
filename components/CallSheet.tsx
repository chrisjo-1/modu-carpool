"use client";
import { useEffect, useState } from "react";
import { type Place, type Post } from "@/lib/types";
import PlaceField from "./PlaceField";
import { Card, Sheet, api, btnGhost, btnPrimary, currentHere, useLang, useT, when } from "./ui";

/** 시각(ms)을 datetime-local 입력 값(기기 현지 시간)으로 */
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

/** 홈 상단의 새로고침 버튼 */
export function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  const t = useT();
  return (
    <button type="button" data-block-id="B216" data-block-name="새로고침" className="w-full rounded-2xl border border-line bg-white py-3 text-[15px] font-semibold text-ink active:opacity-80" onClick={onRefresh}>
      {t("새로고침")}
    </button>
  );
}

/** 하단 메뉴 바로 위, 가운데에 떠 있는 CALL 버튼 (홈 화면에서만 보인다) */
export function FloatingCall({ toast, onGoProfile }: { toast: (m: string) => void; onGoProfile?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-block-id="B217" data-block-name="CALL" aria-label="CALL" className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-accent px-8 py-3.5 text-[16px] font-bold tracking-wide text-white shadow-card active:opacity-80" onClick={() => setOpen(true)}>
        CALL
      </button>
      {open && <CallSheet onClose={() => setOpen(false)} toast={toast} onGoProfile={onGoProfile} />}
    </>
  );
}

type Step = "choose" | "pick" | "confirm" | "taxi";

function CallSheet({ onClose, toast, onGoProfile }: { onClose: () => void; toast: (m: string) => void; onGoProfile?: () => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>("choose");
  const [mine, setMine] = useState<Post[] | null>(null);
  const [picked, setPicked] = useState<Post | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [cost, setCost] = useState<number>(1000);
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
    setStep("pick");
    if (mine) return;
    const r = await api<{ posts: Post[] }>("/api/posts?mine=1");
    if (!r.ok) return toast(t(r.error));
    // 같은 출발지·도착지 글은 한 건만 보여 준다(최신 글 우선). 호출은 그 글 기준으로 나간다.
    const seen = new Set<string>();
    setMine(
      r.data.posts.filter((p) => {
        if (p.status !== "open" || p.originLat == null || p.originLng == null) return false;
        const key = `${p.origin}|${p.dest}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
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
    setBusy(true);
    const here = await locate();
    if (!here) return setBusy(false);
    const r = await api<{ notified: number; radiusKm: number }>("/api/call", "POST", { postId: picked.id, lat: here.lat, lng: here.lng });
    setBusy(false);
    if (!r.ok) {
      setErr(t(r.error));
      return toast(t(r.error));
    }
    setErr("");
    if (callsLeft !== null) setCallsLeft(Math.max(0, callsLeft - 1));
    const who = r.data.notified > 0 ? `${t("운전자")} ${r.data.notified.toLocaleString("ko-KR")}${t("명에게 알림을 보냈어요.")}` : t("반경 안에 알릴 운전자가 없어요.");
    toast(`${who} -${cost.toLocaleString("ko-KR")} ${t("크레딧")}`);
    onClose();
  };

  return (
    <Sheet title="CALL" blockId="S011" onClose={onClose}>
      {step === "choose" && (
        <div className="space-y-3">
          <button type="button" data-block-id="B218" data-block-name="택시동승 호출" className={btnGhost} onClick={taxi}>{t("택시동승 호출")}</button>
          {ready === false && <RegisterContact onGoProfile={onGoProfile} />}
          {band !== null && (
            <p data-block-id="C500" data-block-name="주변 운전자 수" className="rounded-2xl bg-bg px-4 py-3 text-[15px] font-semibold text-ink">
              {t("현재 위치 기준")} · {bandText[band] ?? ""}
            </p>
          )}
          {band === "0" && <p className="text-[14px] leading-relaxed text-sub">{t("지금은 알릴 운전자가 없어요. 운전자가 앱을 열면 다시 확인해 보세요.")}</p>}
          {callsLeft !== null && callsLimit !== null && <p className="text-[14px] text-sub">{t("오늘 남은 CALL")} {callsLeft}/{callsLimit}</p>}
          {callsLeft === 0 && <p className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{t("오늘 CALL 횟수를 모두 썼어요. 내일 다시 이용해 주세요.")}</p>}
          <button type="button" data-block-id="B219" data-block-name="주변 호출" className={btnPrimary} disabled={ready === false || callsLeft === 0 || band === "0"} onClick={pickStep}>{t("주변 운전자 호출")}</button>
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
      {step === "taxi" && <TaxiForm onBack={() => setStep("choose")} onDone={onClose} toast={toast} onGoProfile={onGoProfile} />}
      {step === "confirm" && picked && (
        <div className="space-y-3">
          <Card className="space-y-1 p-4">
            <p className="font-semibold">{picked.origin} → {picked.dest}</p>
            <p className="text-sm text-sub">
              {radius !== null ? `${t("현재 위치 기준")} ${t("반경")} ${radius}km ${t("안의 운전자에게 알림을 보냅니다.")}` : t("현재 위치 주변의 운전자에게 알림을 보냅니다.")}
            </p>
            <p className="text-sm font-semibold text-warn">{t("CALL은")} {cost.toLocaleString("ko-KR")} {t("크레딧이 차감됩니다.")}</p>
            <p className="text-sm text-sub">{t("이 글은 지금 시간으로 다시 올라갑니다.")}</p>
            <p className="text-sm text-sub">{t("응답하는 운전자가 없어도 크레딧은 환불되지 않아요.")}</p>
            <p className="text-sm text-sub">{t("수락한 운전자에게 내 연락 방법과 아이디가 보여요.")} ({contactType})</p>
          </Card>
          {err && <p role="alert" className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{err}</p>}
          <button type="button" data-block-id="B221" data-block-name="호출 보내기" className={btnPrimary} disabled={busy || callsLeft === 0} onClick={send}>{busy ? t("처리 중…") : `${t("호출 보내기")} (${cost.toLocaleString("ko-KR")} ${t("크레딧")})`}</button>
          <button type="button" className={btnGhost} onClick={() => setStep("pick")}>{t("뒤로")}</button>
        </div>
      )}
    </Sheet>
  );
}

/** 받은 호출(알림을 누르면 열린다). 수락하면 호출한 회원의 연락 방법과 아이디를 보여 준다. */
export function IncomingCall({ callId, onClose, toast }: { callId: string; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [info, setInfo] = useState<{ origin: string; dest: string; callerCode: string; accepted: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [contact, setContact] = useState<{ contactType: string; contact: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ origin: string; dest: string; callerCode: string; accepted: boolean }>(`/api/call?callId=${encodeURIComponent(callId)}`).then((r) => {
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
            <p className="text-sm text-sub">{t("호출한 회원")} {info.callerCode}</p>
          </Card>
        )}
        {info && !contact && (
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
      {left !== null && limit !== null && <p className="text-[14px] text-sub">{t("오늘 남은 택시동승 호출")} {left}/{limit} · {t("택시동승 호출은 무료예요.")}</p>}
      {left === 0 && <p className="rounded-2xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-warn">{t("오늘 택시동승 호출 횟수를 모두 썼어요. 내일 다시 이용해 주세요.")}</p>}
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
