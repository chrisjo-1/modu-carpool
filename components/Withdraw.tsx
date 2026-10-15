"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet, api, btnGhost, btnPrimary, field } from "./ui";

type State = "active" | "withdrawn" | "none";

/**
 * 탈퇴 여부 확인 창(한국어만 제공).
 * - 기본: 메일 주소를 넣으면 탈퇴 상태를 알려 주고, 이용 중이면 탈퇴 신청(확인 메일)을 받는다.
 * - token이 있으면: 메일의 탈퇴 링크(?withdraw=토큰)로 들어온 것이므로 바로 탈퇴를 완료한다.
 * 워프 기존 회원과 모두의카풀 가입 회원 모두 이 창구를 쓴다.
 */
export default function Withdraw({ token = "", onClose }: { token?: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    setBusy(true);
    api("/api/withdraw", "POST", { action: "confirm", token }).then((r) => {
      setBusy(false);
      if (r.ok) setConfirmed(true);
      else setMsg(r.error);
    });
  }, [token]);

  if (token) {
    return (
      <Sheet title="탈퇴 처리" blockId="S086" onClose={onClose}>
        <div className="space-y-4 py-2">
          {busy && <p className="text-[15px] text-sub">처리 중이에요…</p>}
          {confirmed && <p className="text-[17px] font-semibold text-ink">정상적으로 탈퇴되었어요.</p>}
          {!busy && !confirmed && msg && <p role="alert" className="text-[15px] leading-relaxed text-warn">{msg}</p>}
          <button type="button" className={btnGhost} onClick={onClose}>닫기</button>
        </div>
      </Sheet>
    );
  }

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setSentTo("");
    const r = await api<{ state: State }>("/api/withdraw", "POST", { action: "check", email });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setState(r.data.state);
  };

  const request = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<{ sentTo: string }>("/api/withdraw", "POST", { action: "request", email });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setSentTo(r.data.sentTo);
  };

  return (
    <Sheet title="탈퇴 여부 확인" blockId="S085" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed text-sub">가입할 때 사용한 메일 주소를 입력해 주세요.</p>
        <form className="space-y-3" onSubmit={check}>
          <label className="block text-sm text-sub">
            이메일
            <input data-block-id="F088" className={`${field} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setState(""); setSentTo(""); setMsg(""); }} />
          </label>
          <button data-block-id="B066" data-block-name="탈퇴 여부 확인하기" className={btnPrimary} disabled={busy || !email}>{busy ? "처리 중이에요…" : "확인하기"}</button>
        </form>

        {state === "withdrawn" && <p className="rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed text-ink">이미 탈퇴 처리된 메일 주소예요.</p>}
        {state === "none" && <p className="rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed text-ink">가입 시 사용한 메일 주소가 아니거나 이미 삭제 처리된 메일이에요.</p>}
        {state === "active" && !sentTo && (
          <div className="space-y-3">
            <p className="rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed text-ink">아직 탈퇴가 처리되지 않았어요. 탈퇴를 신청하면 이 메일 주소로 확인 링크를 보내 드려요.</p>
            <button data-block-id="B067" data-block-name="탈퇴 신청하기" className={btnPrimary} disabled={busy} onClick={request}>탈퇴 신청하기</button>
          </div>
        )}
        {sentTo && <p className="rounded-xl bg-accentSoft px-4 py-3 text-[15px] leading-relaxed text-accent">{sentTo}(으)로 확인 메일을 보냈어요. 메일의 링크를 눌러 탈퇴를 완료해 주세요.</p>}
        {msg && <p role="alert" className="text-[14px] text-warn">{msg}</p>}
      </div>
    </Sheet>
  );
}
