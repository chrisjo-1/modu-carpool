"use client";
import { useEffect, useRef, useState } from "react";
import { Sheet, api, btnGhost, btnPrimary, field } from "./ui";

/** 개인정보만 삭제 버튼(주황). 탈퇴 버튼(파랑)과 구분한다. */
const btnOrange = "w-full rounded-2xl bg-[#E8590C] px-5 py-4 text-[17px] font-semibold text-white active:opacity-90 disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97]";

type State = "active" | "withdrawn" | "none";
type Kind = "withdraw" | "purge";

/**
 * 탈퇴 여부 확인 창(한국어만 제공).
 * - 기본: 메일 주소를 넣으면 상태를 알려 준다. 이용 중이면 탈퇴 신청, 또는 (가입 계정이 있으면) 계속 이용하며 개인정보만 삭제를 고른다.
 * - token이 있으면: 메일의 확인 링크(?withdraw=토큰)로 들어온 것이므로 그 처리를 완료한다.
 * - initialEmail이 있으면(로그인한 회원이 내 정보 설정에서 열었을 때): 메일 주소를 채우고 바로 상태를 확인한다.
 * 워프 기존 회원과 모두의카풀 가입 회원 모두 이 창구를 쓴다.
 */
export default function Withdraw({ token = "", initialEmail = "", onClose }: { token?: string; initialEmail?: string; onClose: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<State | "">("");
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState<{ to: string; kind: Kind } | null>(null);
  const [done, setDone] = useState<Kind | "">("");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    setBusy(true);
    api<{ kind: Kind }>("/api/withdraw", "POST", { action: "confirm", token }).then((r) => {
      setBusy(false);
      if (r.ok) setDone(r.data.kind);
      else setMsg(r.error);
    });
  }, [token]);

  const autoChecked = useRef(false);
  useEffect(() => {
    if (token || !initialEmail || autoChecked.current) return;
    autoChecked.current = true;
    api<{ state: State; account: boolean }>("/api/withdraw", "POST", { action: "check", email: initialEmail }).then((r) => {
      if (!r.ok) return setMsg(r.error);
      setState(r.data.state);
      setAccount(r.data.account);
    });
  }, [token, initialEmail]);

  if (token) {
    return (
      <Sheet title="확인 처리" blockId="S086" onClose={onClose}>
        <div className="space-y-4 py-2">
          {busy && <p className="text-[15px] text-sub">처리 중이에요…</p>}
          {done === "withdraw" && <p className="text-[17px] font-semibold text-ink">정상적으로 탈퇴되었어요.</p>}
          {done === "purge" && (
            <div className="space-y-2">
              <p className="text-[17px] font-semibold text-ink">개인정보를 삭제했어요.</p>
              <p className="text-[15px] leading-relaxed text-sub">계속 이용하시려면 로그인 화면에서 &apos;비밀번호 찾기&apos;로 새 비밀번호를 정해 주세요.</p>
            </div>
          )}
          {!busy && !done && msg && <p role="alert" className="text-[15px] leading-relaxed text-warn">{msg}</p>}
          <button type="button" className={btnGhost} onClick={onClose}>닫기</button>
        </div>
      </Sheet>
    );
  }

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setSent(null);
    const r = await api<{ state: State; account: boolean }>("/api/withdraw", "POST", { action: "check", email });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setState(r.data.state);
    setAccount(r.data.account);
  };

  const request = async (kind: Kind) => {
    setBusy(true);
    setMsg("");
    const r = await api<{ sentTo: string }>("/api/withdraw", "POST", { action: "request", email, kind });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setSent({ to: r.data.sentTo, kind });
  };

  return (
    <Sheet title="탈퇴 여부 확인" blockId="S085" onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-bg px-4 py-3 text-[13px] leading-relaxed text-sub">메일 발송 시 개인정보는 5년간 보관하도록 되어 있어, 개인정보 삭제에 동의해 주셔야 삭제가 가능합니다. 아래에서 메일 주소를 확인한 뒤 탈퇴 또는 개인정보만 삭제를 골라 주세요.</p>
        <p className="text-[15px] leading-relaxed text-sub">가입할 때 사용한 메일 주소를 입력해 주세요.</p>
        <form className="space-y-3" onSubmit={check}>
          <label className="block text-sm text-sub">
            이메일
            <input data-block-id="F088" className={`${field} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setState(""); setSent(null); setMsg(""); }} />
          </label>
          <button data-block-id="B066" data-block-name="탈퇴 여부 확인하기" className={btnPrimary} disabled={busy || !email}>{busy ? "처리 중이에요…" : "확인하기"}</button>
        </form>

        {state === "withdrawn" && <p className="rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed text-ink">이미 탈퇴 처리된 메일 주소예요.</p>}
        {state === "none" && <p className="rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed text-ink">가입 시 사용한 메일 주소가 아니거나 이미 삭제 처리된 메일이에요.</p>}
        {state === "active" && !sent && (
          <div className="space-y-4">
            <p className="rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed text-ink">아직 탈퇴가 처리되지 않았어요. 아래에서 골라 주세요. 확인 링크는 이 메일 주소로 보내 드려요.</p>
            <div className="space-y-2">
              <button data-block-id="B067" data-block-name="탈퇴 신청하기" className={btnPrimary} disabled={busy} onClick={() => request("withdraw")}>탈퇴 신청하기</button>
              <p className="text-[13px] leading-relaxed text-sub">탈퇴하면 로그인과 글 노출이 중단되고, 이름·전화번호 등 개인정보는 삭제돼요. 이메일 주소만 남아요.</p>
            </div>
            {account && (
              <div className="space-y-2">
                <button data-block-id="B068" data-block-name="개인정보만 삭제하기" className={btnOrange} disabled={busy} onClick={() => request("purge")}>계속 이용하며 개인정보만 삭제</button>
                <p className="text-[13px] leading-relaxed text-sub">계정은 그대로 두고 이름·전화번호·연락처 등 개인정보만 삭제해요. 이메일 주소는 남아요. 삭제 뒤에는 비밀번호를 다시 정해야 로그인할 수 있고, 글을 올릴 때 연락처를 다시 입력해야 해요.</p>
              </div>
            )}
          </div>
        )}
        {sent && (
          <p className="rounded-xl bg-accentSoft px-4 py-3 text-[15px] leading-relaxed text-accent">
            {sent.to}(으)로 확인 메일을 보냈어요. 메일의 버튼으로 탈퇴 또는 개인정보만 삭제를 완료해 주세요.
          </p>
        )}
        {msg && <p role="alert" className="text-[14px] text-warn">{msg}</p>}
      </div>
    </Sheet>
  );
}
