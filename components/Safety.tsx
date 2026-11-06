"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { api, Avatar, btnGhost, field, Sheet } from "@/components/ui";
import { SAFETY_CLOSE_HOUR, SAFETY_DISCLAIMER, SAFETY_DRIVER_CONSENT, SAFETY_HOURS_TEXT, SAFETY_INTERVAL_MIN, SAFETY_NIGHT_TEXT, SAFETY_PHOTO_DRIVER, SAFETY_PHOTO_ME, SAFETY_WATCH_TEXT } from "@/lib/safety";

const PhotoGateSheet = dynamic(() => import("./PhotoGate"), { ssr: false });

/** 대화방의 안심동행 상태(서버 shape와 같다) */
type Session = {
  id: string;
  status: string;
  result: string;
  startedAt: number | null;
  pendingSince: number | null;
  lastAnswer: string;
  isRider: boolean;
  iRequested: boolean;
  iConsented: boolean;
  otherConsented: boolean;
  phoneSaved: boolean;
  urgentAt: number | null;
  boardedAt: number | null;
  rearSeat: boolean;
  etaAt: number | null;
  lateAt: number | null;
};
type Post = { origin: string; dest: string; timeGo: string; originLat: number | null; originLng: number | null; destLat: number | null; destLng: number | null };
type Data = { accepted: boolean; post: Post; open?: boolean; canStart: boolean; session: Session | null; myPhoto?: boolean; otherPhoto?: string; otherHasPhoto?: boolean; otherName?: string };

const FALLBACK_MIN = 40; // 경로 시간을 못 구했을 때 쓰는 기본 시간(분)
const POLL_MS = 8000;

/** 대화방 안의 안심동행 블록. 수락된 카풀에서만 보인다. */
export function SafetyBlock({ requestId, toast }: { requestId: string; toast: (m: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [sheet, setSheet] = useState<"start" | "consent" | "photo" | "photoConsent" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api<Data>(`/api/safety?req=${requestId}`);
    if (r.ok) setData(r.data);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  if (!data || !data.accepted) return null;
  const s = data.session;
  // 신청은 여성 회원만. 진행 중인 건이 있으면 누구나(상대분 포함) 보고 동의·종료할 수 있다.
  if (!s && !data.canStart) return null;

  // arrived: 탑승자의 '도착했어요' 종료(카풀도 끝남). 아니면 일반 종료.
  const end = async (arrived: boolean) => {
    if (!s || busy) return;
    const ask = arrived
      ? "도착했나요? 안심동행을 마치면 카풀도 끝나고, 입력한 전화번호는 지워져요."
      : "안심동행을 종료할까요? 입력한 전화번호는 지워져요.";
    if (!confirm(ask)) return;
    setBusy(true);
    const r = await api("/api/safety", "POST", { action: "end", id: s.id });
    setBusy(false);
    if (!r.ok) return toast(r.error || "종료하지 못했어요.");
    toast(arrived ? "도착을 확인했어요. 안심동행을 마쳤어요." : "안심동행을 종료했어요.");
    load();
  };

  const urgent = async () => {
    if (!s || busy) return;
    if (!confirm("위급 신호를 보낼까요? 운영팀 화면에 바로 올라가고, 상대분께도 알림이 가요.")) return;
    setBusy(true);
    const r = await api("/api/safety", "POST", { action: "urgent", id: s.id });
    setBusy(false);
    if (!r.ok) return toast(r.error || "보내지 못했어요.");
    toast("위급 신호를 보냈어요.");
    load();
  };

  return (
    <div className="rounded-2xl border border-warn/30 bg-warnSoft p-3 text-[14px] text-ink">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-warn">🛡 안심동행</p>
          <p className="mt-0.5 text-[13px] text-sub">{SAFETY_DISCLAIMER} {SAFETY_HOURS_TEXT}</p>
        </div>
        {s && s.status !== "closed" && !(s.isRider && s.status === "active" && s.boardedAt) && (
          <button type="button" onClick={() => end(false)} disabled={busy} className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-[14px] font-semibold text-ink disabled:opacity-50">종료</button>
        )}
      </div>

      {(s ? s.status !== "closed" : data.canStart) && (
        <div data-block-id="C430" data-block-name="서로 프로필 확인" className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-white p-3">
          {data.otherHasPhoto ? <Avatar src={data.otherPhoto} name={data.otherName || "상대"} size={56} /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg text-[12px] text-sub">사진 없음</div>}
          <div className="min-w-0 flex-1 text-[14px]">
            <p className="font-semibold">{data.otherName || "상대분"}</p>
            {data.otherHasPhoto ? (
              <p className="text-sub">만나면 이 사진과 같은 분인지 꼭 확인해 주세요.</p>
            ) : (
              <>
                <p className="text-warn">상대분이 아직 프로필 사진을 등록하지 않았어요. 등록해 달라고 알려 드릴게요.</p>
                <button type="button" data-block-id="B483" disabled={busy} onClick={async () => { setBusy(true); const r = await api("/api/safety", "POST", { action: "askPhoto", requestId }); setBusy(false); toast(r.ok ? "상대분께 사진을 올려 달라고 알렸어요." : r.error || "알리지 못했어요."); }} className="mt-1 rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold">사진 올려 달라고 알리기</button>
              </>
            )}
            {data.myPhoto === false && s && !s.iRequested && (
              <div data-block-id="C431" data-block-name="운전자 사진 등록 권유" className="mt-2 rounded-lg border border-warn/40 bg-warnSoft p-2">
                <p className="text-[13px] font-semibold text-ink">{SAFETY_PHOTO_DRIVER}</p>
                <button type="button" data-block-id="B485" onClick={() => setSheet("photoConsent")} className="mt-1.5 w-full rounded-lg bg-warn px-3 py-2 text-[14px] font-semibold text-white">프로필 사진 등록하기</button>
              </div>
            )}
          </div>
        </div>
      )}
      {sheet === "photo" && <PhotoGateSheet text={SAFETY_PHOTO_ME} button="프로필 사진 등록하기" onClose={() => setSheet(null)} onSaved={load} toast={toast} />}
      {sheet === "photoConsent" && <PhotoGateSheet text={SAFETY_PHOTO_DRIVER} button="프로필 사진 등록하기" onClose={() => setSheet(null)} onSaved={load} toast={toast} />}

      {!s && data.canStart && data.open === false && (
        <div data-block-id="C429" data-block-name="안심동행 운영 시간 아님" className="mt-2 rounded-xl border border-line bg-white p-3">
          <p className="text-[14px] font-semibold text-ink">{SAFETY_HOURS_TEXT}</p>
          <p className="mt-1 text-[13px] text-sub">{SAFETY_NIGHT_TEXT}</p>
          <a href="tel:112" className="mt-2 block rounded-xl border border-warn bg-white px-4 py-2.5 text-center text-[15px] font-bold text-warn">112 전화 걸기</a>
        </div>
      )}
      {!s && data.canStart && data.open !== false && (
        <button type="button" data-block-id="B484" onClick={() => setSheet(data.myPhoto === false ? "photo" : "start")} className="mt-2 w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-semibold text-white active:opacity-90">안심동행 신청하기</button>
      )}

      {s?.status === "pending" && s.iRequested && (
        <p className="mt-2 text-[14px] text-sub">상대분의 동의를 기다리고 있어요. 동의하면 시작돼요.</p>
      )}
      {s?.status === "pending" && !s.iRequested && data.open === false && (
        <p className="mt-2 text-[14px] text-sub">{SAFETY_NIGHT_TEXT}</p>
      )}
      {s?.status === "pending" && !s.iRequested && data.open !== false && (
        <button type="button" onClick={() => setSheet("consent")} className="mt-2 w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-semibold text-white active:opacity-90">상대분이 신청했어요 · 동의하고 시작</button>
      )}

      {s?.status === "active" && (
        <>
          <p className="mt-2 text-[14px] text-sub">진행 중이에요. {s.isRider ? "이동 중에 몇 번 가볍게 여쭤볼게요." : s.boardedAt ? `탑승자가 탑승했어요${s.etaAt ? ` · 도착 예정 ${hm(s.etaAt)}` : ""}.` : "탑승자가 탑승하면 알려 드려요."}</p>
          <p className="mt-1 text-[13px] font-semibold text-warn">{SAFETY_WATCH_TEXT}</p>
          {data.open === false && <p className="mt-1 rounded-lg bg-white p-2 text-[13px] text-ink">운영 시간(밤 {SAFETY_CLOSE_HOUR - 12}시까지)이 지나 운영팀 확인이 늦을 수 있어요. 위급하면 바로 112에 연락해 주세요.</p>}
          {s.isRider && !s.boardedAt && <BoardCard session={s} post={data.post} onDone={load} toast={toast} />}
          {s.isRider && s.boardedAt && (
            <div className={`mt-2 rounded-xl border p-3 ${s.lateAt ? "border-warn bg-white" : "border-line bg-white"}`}>
              <p className="text-[15px] font-semibold">{s.lateAt ? "예상 도착 시각이 지났어요. 도착하셨나요?" : `도착 예정 ${s.etaAt ? hm(s.etaAt) : "-"} · 도착하면 아래 버튼을 눌러 주세요`}</p>
              <button type="button" data-block-id="B482" data-block-name="도착했어요" onClick={() => end(true)} disabled={busy} className="mt-2 w-full rounded-xl bg-mint px-4 py-4 text-[18px] font-bold text-white disabled:opacity-50">도착했어요</button>
              <EtaEdit session={s} onDone={load} toast={toast} />
            </div>
          )}
          {s.urgentAt ? (
            <div className="mt-2 rounded-xl bg-warn p-3 text-white">
              <p className="text-[15px] font-semibold">위급 신호를 보냈어요. 바로 112에 전화해 주세요.</p>
              <a href="tel:112" className="mt-2 block rounded-xl bg-white px-4 py-3 text-center text-[16px] font-bold text-warn">112 전화 걸기</a>
            </div>
          ) : (
            <button type="button" onClick={urgent} disabled={busy} className="mt-2 w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-bold text-white disabled:opacity-50">🚨 위급해요 · 운영팀에 바로 알리기</button>
          )}
          {s.isRider && s.boardedAt && <RiderChecks session={s} post={data.post} onChanged={load} toast={toast} />}
        </>
      )}

      {sheet === "start" && (
        <PhoneSheet
          title="안심동행 신청"
          button="신청하기"
          onClose={() => setSheet(null)}
          onSubmit={async (phone) => {
            const r = await api("/api/safety", "POST", { action: "start", requestId, phone });
            if (!r.ok) return toast(r.error || "신청하지 못했어요.");
            toast("신청했어요. 상대분이 동의하면 시작돼요.");
            setSheet(null);
            load();
          }}
        />
      )}
      {sheet === "consent" && s && (
        <PhoneSheet
          title="안심동행 동의"
          button="동의하고 시작"
          consentText={s.isRider ? undefined : SAFETY_DRIVER_CONSENT}
          onClose={() => setSheet(null)}
          onSubmit={async (phone) => {
            const r = await api("/api/safety", "POST", { action: "consent", id: s.id, phone });
            if (!r.ok) return toast(r.error || "동의하지 못했어요.");
            toast("안심동행을 시작했어요.");
            setSheet(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** 전화번호 입력과 동의. 전화번호는 운영팀만 보고 상대에게 공개되지 않는다. */
function PhoneSheet({ title, button, consentText, onClose, onSubmit }: { title: string; button: string; consentText?: string; onClose: () => void; onSubmit: (phone: string) => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = agree && /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ""));
  return (
    <Sheet title={title} onClose={onClose} blockId="S430">
      <div className="space-y-4 text-[15px] text-ink">
        <p className="rounded-xl bg-warnSoft p-3 text-[14px] text-sub">{SAFETY_DISCLAIMER}</p>
        {consentText ? (
          <p data-block-id="C427" className="rounded-xl border border-warn/40 bg-white p-3 text-[16px] font-semibold leading-relaxed text-ink">{consentText}</p>
        ) : (
          <p className="text-[14px] font-semibold text-warn">{SAFETY_WATCH_TEXT}</p>
        )}
        <label className="block text-sm text-sub">
          연락 가능한 휴대폰 번호
          <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" className={`${field} mt-1`} />
        </label>
        <label className="flex items-start gap-2 text-[14px] text-sub">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
          <span>번호는 안전 확인을 위해 운영팀만 보며, 상대에게 공개되지 않아요. 확인이 끝나면 지워요.</span>
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>취소</button>
          <button type="button" disabled={!ok || busy} onClick={async () => { setBusy(true); await onSubmit(phone); setBusy(false); }} className="w-full rounded-2xl bg-warn px-5 py-4 text-[17px] font-semibold text-white disabled:opacity-40">{button}</button>
        </div>
      </div>
    </Sheet>
  );
}

const hm = (t: number) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
/** <input type="time"> 값(HH:MM) → 오늘(이미 지난 시각이면 내일) 그 시각 */
function timeToMs(v: string) {
  const [h, m] = v.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
const toTimeValue = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

/** 경로 시간(분). 좌표가 없거나 못 구하면 FALLBACK_MIN */
function useRouteMinutes(post: Post) {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    if (post.originLat == null || post.originLng == null || post.destLat == null || post.destLng == null) {
      setMin(FALLBACK_MIN);
      return;
    }
    fetch(`/api/route?olat=${post.originLat}&olng=${post.originLng}&dlat=${post.destLat}&dlng=${post.destLng}`)
      .then((r) => r.json())
      .then((j: { seconds?: number }) => { if (alive) setMin(j.seconds ? Math.max(10, Math.round(j.seconds / 60)) : FALLBACK_MIN); })
      .catch(() => { if (alive) setMin(FALLBACK_MIN); });
    return () => { alive = false; };
  }, [post.originLat, post.originLng, post.destLat, post.destLng]);
  return min;
}

/** 탑승자: 탑승 체크 — [뒷자리에 탔어요] + 예상 도착 시각(경로 시간으로 미리 채움, 고칠 수 있음) */
function BoardCard({ session, post, onDone, toast }: { session: Session; post: Post; onDone: () => void; toast: (m: string) => void }) {
  const routeMin = useRouteMinutes(post);
  const [eta, setEta] = useState("");
  const [rear, setRear] = useState(true);
  const [face, setFace] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (routeMin != null && !eta) setEta(toTimeValue(Date.now() + (routeMin + 5) * 60_000));
  }, [routeMin, eta]);
  const submit = async () => {
    const t = timeToMs(eta);
    if (!Number.isFinite(t)) return toast("예상 도착 시각을 골라 주세요.");
    if (!face) return toast("운전자가 프로필 사진과 같은 분인지 먼저 확인해 주세요.");
    setBusy(true);
    const r = await api("/api/safety", "POST", { action: "board", id: session.id, rearSeat: rear, eta: t });
    setBusy(false);
    if (!r.ok) return toast(r.error || "저장하지 못했어요.");
    toast(rear ? "뒷자리 탑승을 확인했어요. 도착하면 [도착했어요]를 눌러 주세요." : "탑승을 확인했어요. 도착하면 [도착했어요]를 눌러 주세요.");
    onDone();
  };
  return (
    <div data-block-id="C428" data-block-name="탑승 체크" className="mt-2 space-y-3 rounded-xl border border-warn/40 bg-white p-3">
      <p className="text-[15px] font-semibold">차에 타면 알려 주세요</p>
      <label className="flex items-center gap-2 text-[15px]">
        <input type="checkbox" checked={face} onChange={(e) => setFace(e.target.checked)} className="h-5 w-5" />
        운전자가 프로필 사진과 같은 분이에요
      </label>
      <label className="flex items-center gap-2 text-[15px]">
        <input type="checkbox" checked={rear} onChange={(e) => setRear(e.target.checked)} className="h-5 w-5" />
        뒷자리에 탔어요
      </label>
      <p className="-mt-1 text-[13px] text-sub">처음 만나는 분과는 뒷자리에 앉기를 권해요.</p>
      <label className="block text-[14px] text-sub">
        예상 도착 시각 {routeMin != null && <span>(경로 약 {routeMin}분)</span>}
        <input type="time" value={eta} onChange={(e) => setEta(e.target.value)} className={`${field} mt-1`} />
      </label>
      <button type="button" data-block-id="B481" data-block-name="탑승했어요" disabled={busy || !eta || !face} onClick={submit} className="w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-semibold text-white disabled:opacity-50">탑승했어요</button>
    </div>
  );
}

/** 탑승자: 예상 도착 시각 바꾸기(길이 막힐 때) */
function EtaEdit({ session, onDone, toast }: { session: Session; onDone: () => void; toast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [eta, setEta] = useState(session.etaAt ? toTimeValue(session.etaAt) : "");
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[13px] font-semibold text-sub underline">늦어질 것 같아요 · 도착 시각 바꾸기</button>;
  return (
    <div className="mt-2 flex gap-2">
      <input type="time" value={eta} onChange={(e) => setEta(e.target.value)} className={field} />
      <button type="button" disabled={busy || !eta} onClick={async () => {
        const t = timeToMs(eta);
        if (!Number.isFinite(t)) return;
        setBusy(true);
        const r = await api("/api/safety", "POST", { action: "board", id: session.id, eta: t });
        setBusy(false);
        if (!r.ok) return toast(r.error || "바꾸지 못했어요.");
        toast("도착 예정 시각을 바꿨어요.");
        setOpen(false);
        onDone();
      }} className="shrink-0 rounded-xl border border-line bg-white px-4 py-2 text-[15px] font-semibold disabled:opacity-50">저장</button>
    </div>
  );
}

/**
 * 탑승자 앱에서만 동작: 출발 뒤 SAFETY_INTERVAL_MIN분마다, 도착 예정(경로 시간) 전까지 확인 질문을 보낸다.
 * 질문은 앱이 열려 있을 때만 떠요(예약 장치는 아직 없음).
 */
function RiderChecks({ session, post, onChanged, toast }: { session: Session; post: Post; onChanged: () => void; toast: (m: string) => void }) {
  const [endMs, setEndMs] = useState<number | null>(null);
  const lastSlot = useRef<number>(-1);
  // 부모가 매번 새 함수를 넘기므로 최신 것만 ref로 든다(효과를 다시 돌리지 않게)
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const startedAt = session.boardedAt ?? session.startedAt ?? Date.now();
  const intervalMs = SAFETY_INTERVAL_MIN * 60_000;

  // 탑승자가 정한 예상 도착 시각이 있으면 그때까지, 없으면 경로 시간으로
  useEffect(() => {
    if (session.etaAt) {
      setEndMs(session.etaAt);
      return;
    }
    let alive = true;
    const minutes = (sec: number) => Math.max(sec * 1000, 10 * 60_000);
    if (post.originLat == null || post.originLng == null || post.destLat == null || post.destLng == null) {
      setEndMs(startedAt + FALLBACK_MIN * 60_000);
      return;
    }
    fetch(`/api/route?olat=${post.originLat}&olng=${post.originLng}&dlat=${post.destLat}&dlng=${post.destLng}`)
      .then((r) => r.json())
      .then((j: { seconds?: number }) => { if (alive) setEndMs(startedAt + (j.seconds ? minutes(j.seconds) : FALLBACK_MIN * 60_000)); })
      .catch(() => { if (alive) setEndMs(startedAt + FALLBACK_MIN * 60_000); });
    return () => { alive = false; };
  }, [post.originLat, post.originLng, post.destLat, post.destLng, startedAt, session.etaAt]);

  // 앱을 연 시점의 칸은 건너뛰고, 다음 칸 경계부터 질문한다
  useEffect(() => {
    if (lastSlot.current < 0) lastSlot.current = Math.floor((Date.now() - startedAt) / intervalMs);
  }, [startedAt, intervalMs]);

  useEffect(() => {
    if (endMs == null) return;
    const tick = async () => {
      const now = Date.now();
      if (now > endMs || session.pendingSince) return;
      const slot = Math.floor((now - startedAt) / intervalMs);
      if (slot <= lastSlot.current || slot < 1) return;
      lastSlot.current = slot;
      const r = await api("/api/safety", "POST", { action: "ask", id: session.id });
      if (r.ok) changed.current();
    };
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [endMs, session.id, session.pendingSince, startedAt, intervalMs]);

  if (!session.pendingSince) return null;
  return <AnswerCard session={session} onChanged={onChanged} toast={toast} />;
}

/** 탑승자에게 뜨는 확인 카드(네·아니오). 화면을 가리지 않는 아래쪽 카드. */
function AnswerCard({ session, onChanged, toast }: { session: Session; onChanged: () => void; toast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const answer = async (a: "yes" | "no") => {
    setBusy(true);
    const r = await api("/api/safety", "POST", { action: "answer", id: session.id, answer: a });
    setBusy(false);
    if (!r.ok) return toast(r.error || "답을 보내지 못했어요.");
    if (a === "no") toast("불편하신 점이 있으면 바로 상대분이나 112에 연락해 주세요.");
    onChanged();
  };
  return (
    <div role="alertdialog" aria-live="assertive" className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-white p-4 shadow-lg">
      <p className="text-[16px] font-semibold text-ink">이동하는 데 불편함은 없으신가요?</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => answer("no")} className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[16px] font-semibold text-ink disabled:opacity-50">아니요, 불편해요</button>
        <button type="button" disabled={busy} onClick={() => answer("yes")} className="w-full rounded-xl bg-mint px-4 py-3 text-[16px] font-semibold text-white disabled:opacity-50">네, 괜찮아요</button>
      </div>
    </div>
  );
}

/**
 * 운전자 대화방: 탑승자가 여성인 수락된 카풀이면 연락 가능한 번호를 받는다.
 * 번호는 안전 확인에만 쓰고 상대에게 공개하지 않으며, 카풀이 끝나면 지운다(데이터로 보관하지 않음).
 */
export function DriverPhoneBlock({ requestId, toast }: { requestId: string; toast: (m: string) => void }) {
  const [state, setState] = useState<{ needed: boolean; registered: boolean } | null>(null);
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api<{ needed: boolean; registered: boolean }>(`/api/ride-contact?req=${requestId}`);
    if (r.ok) setState(r.data);
  };
  useEffect(() => {
    load();
    // 안심동행 종료 등으로 연락처가 지워지면 화면도 따라가도록 주기적으로 다시 읽는다
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  if (!state || !state.needed) return null;

  const register = async () => {
    setBusy(true);
    const r = await api("/api/ride-contact", "POST", { action: "register", requestId, phone, agree });
    setBusy(false);
    if (!r.ok) return toast(r.error || "등록하지 못했어요.");
    toast("연락처를 등록했어요.");
    setPhone("");
    setAgree(false);
    load();
  };

  const finish = async () => {
    if (!confirm("카풀을 마쳤나요? 등록한 번호는 지워져요.")) return;
    setBusy(true);
    const r = await api("/api/ride-contact", "POST", { action: "end", requestId });
    setBusy(false);
    if (!r.ok) return toast(r.error || "삭제하지 못했어요.");
    toast("연락처를 삭제했어요.");
    load();
  };

  if (state.registered) {
    return (
      <div className="rounded-2xl border border-warn/30 bg-warnSoft p-3 text-[14px] text-ink">
        <p className="font-semibold text-warn">🛡 안전을 위한 연락처 등록됨</p>
        <p className="mt-1 text-sub">번호는 안전 확인에만 쓰고 상대에게 공개되지 않아요. 카풀이 끝나면 아래 버튼으로 지워 주세요.</p>
        <button type="button" disabled={busy} onClick={finish} className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] font-semibold text-ink disabled:opacity-50">카풀 마쳤어요 · 번호 삭제</button>
      </div>
    );
  }

  const ok = agree && /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ""));
  return (
    <div className="rounded-2xl border border-warn/30 bg-warnSoft p-3 text-[14px] text-ink">
      <p className="font-semibold text-warn">🛡 안심동행 · 탑승자가 여성이에요</p>
      <p className="mt-1 font-semibold text-ink">{SAFETY_DRIVER_CONSENT}</p>
      <p className="mt-1 text-sub">동의하시면 연락 가능한 번호를 남겨 주세요. 번호는 안전 확인에만 쓰고 상대에게 공개하지 않으며, 카풀이 끝나면 삭제해요.</p>
      <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" className={`${field} mt-2`} />
      <label className="mt-2 flex items-start gap-2 text-[13px] text-sub">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
        <span>도착할 때까지 운영팀이 함께 지켜보는 데 동의하고, 안전 확인을 위해 번호를 남겨요. 카풀이 끝나면 삭제되는 것을 알고 있어요.</span>
      </label>
      <button type="button" disabled={!ok || busy} onClick={register} className="mt-2 w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-semibold text-white disabled:opacity-40">동의하고 번호 남기기</button>
    </div>
  );
}
