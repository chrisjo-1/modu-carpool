"use client";

import { useEffect, useRef, useState } from "react";
import { api, btnGhost, field, Sheet } from "@/components/ui";
import { SAFETY_DISCLAIMER, SAFETY_INTERVAL_MIN } from "@/lib/safety";

/** 대화방의 안전지킴 상태(서버 shape와 같다) */
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
};
type Post = { origin: string; dest: string; timeGo: string; originLat: number | null; originLng: number | null; destLat: number | null; destLng: number | null };
type Data = { accepted: boolean; post: Post; canStart: boolean; session: Session | null };

const FALLBACK_MIN = 40; // 경로 시간을 못 구했을 때 쓰는 기본 시간(분)
const POLL_MS = 8000;

/** 대화방 안의 안전지킴 블록. 수락된 카풀에서만 보인다. */
export function SafetyBlock({ requestId, toast }: { requestId: string; toast: (m: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [sheet, setSheet] = useState<"start" | "consent" | null>(null);
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

  const end = async () => {
    if (!s || busy) return;
    if (!confirm("안전지킴을 종료할까요? 입력한 전화번호는 지워져요.")) return;
    setBusy(true);
    const r = await api("/api/safety", "POST", { action: "end", id: s.id });
    setBusy(false);
    if (!r.ok) return toast(r.error || "종료하지 못했어요.");
    toast("안전지킴을 종료했어요.");
    load();
  };

  return (
    <div className="rounded-2xl border border-warn/30 bg-warnSoft p-3 text-[14px] text-ink">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-warn">🛡 안전지킴</p>
          <p className="mt-0.5 text-[13px] text-sub">{SAFETY_DISCLAIMER}</p>
        </div>
        {s && s.status !== "closed" && (
          <button type="button" onClick={end} disabled={busy} className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-[14px] font-semibold text-ink disabled:opacity-50">종료</button>
        )}
      </div>

      {!s && data.canStart && (
        <button type="button" onClick={() => setSheet("start")} className="mt-2 w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-semibold text-white active:opacity-90">안전지킴 신청하기</button>
      )}

      {s?.status === "pending" && s.iRequested && (
        <p className="mt-2 text-[14px] text-sub">상대분의 동의를 기다리고 있어요. 동의하면 시작돼요.</p>
      )}
      {s?.status === "pending" && !s.iRequested && (
        <button type="button" onClick={() => setSheet("consent")} className="mt-2 w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-semibold text-white active:opacity-90">상대분이 신청했어요 · 동의하고 시작</button>
      )}

      {s?.status === "active" && (
        <>
          <p className="mt-2 text-[14px] text-sub">진행 중이에요. {s.isRider ? "이동 중에 몇 번 가볍게 여쭤볼게요." : "탑승자께 이동 중 확인 질문이 가요."}</p>
          {s.isRider && <RiderChecks session={s} post={data.post} onChanged={load} toast={toast} />}
        </>
      )}

      {sheet === "start" && (
        <PhoneSheet
          title="안전지킴 신청"
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
          title="안전지킴 동의"
          button="동의하고 시작"
          onClose={() => setSheet(null)}
          onSubmit={async (phone) => {
            const r = await api("/api/safety", "POST", { action: "consent", id: s.id, phone });
            if (!r.ok) return toast(r.error || "동의하지 못했어요.");
            toast("안전지킴을 시작했어요.");
            setSheet(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** 전화번호 입력과 동의. 전화번호는 운영팀만 보고 상대에게 공개되지 않는다. */
function PhoneSheet({ title, button, onClose, onSubmit }: { title: string; button: string; onClose: () => void; onSubmit: (phone: string) => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = agree && /^01[016789]\d{7,8}$/.test(phone.replace(/\D/g, ""));
  return (
    <Sheet title={title} onClose={onClose} blockId="S430">
      <div className="space-y-4 text-[15px] text-ink">
        <p className="rounded-xl bg-warnSoft p-3 text-[14px] text-sub">{SAFETY_DISCLAIMER}</p>
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
  const startedAt = session.startedAt ?? Date.now();
  const intervalMs = SAFETY_INTERVAL_MIN * 60_000;

  // 경로 시간 구하기(좌표가 있을 때만)
  useEffect(() => {
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
  }, [post.originLat, post.originLng, post.destLat, post.destLng, startedAt]);

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
    // 안전지킴 종료 등으로 연락처가 지워지면 화면도 따라가도록 주기적으로 다시 읽는다
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
      <p className="font-semibold text-warn">🛡 탑승자가 여성이에요 · 연락처를 등록해 주세요</p>
      <p className="mt-1 text-sub">안전을 위해 운전자님의 연락 가능한 번호가 필요해요. 번호는 안전 확인에만 쓰고, 데이터로 보관하지 않아요. 카풀이 끝나면 삭제해요.</p>
      <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" className={`${field} mt-2`} />
      <label className="mt-2 flex items-start gap-2 text-[13px] text-sub">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
        <span>안전 확인을 위해 번호를 등록하는 데 동의해요. 카풀이 끝나면 삭제되는 것을 알고 있어요.</span>
      </label>
      <button type="button" disabled={!ok || busy} onClick={register} className="mt-2 w-full rounded-xl bg-warn px-4 py-3 text-[16px] font-semibold text-white disabled:opacity-40">연락처 등록하기</button>
    </div>
  );
}
