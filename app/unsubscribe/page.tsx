"use client";
import { useState } from "react";

/** 웹 수신거부 페이지. 메일을 받아 보던 주소를 넣으면 광고성 메일을 더 보내지 않는다. */
export default function UnsubscribePage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/unsubscribe/web", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setMsg(j.error ?? "처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setDone(true);
    } catch {
      setMsg("네트워크 상태를 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-[var(--vh100)] max-w-md bg-bg px-4 py-10 text-ink">
      <p className="text-[18px] font-bold text-accent">모두의카풀</p>
      <h1 className="mt-6 text-[24px] font-bold">광고성 메일 수신거부</h1>
      {done ? (
        <p className="mt-4 rounded-2xl bg-white px-5 py-4 text-[15px] leading-relaxed shadow-card">
          수신거부를 완료했어요. 앞으로 광고성 메일은 보내지 않습니다. 계정과 서비스 안내 메일은 계속 받으실 수 있어요.
        </p>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <p className="text-[15px] leading-relaxed text-sub">광고성 메일을 받던 이메일 주소를 입력해 주세요. 이 주소로 보내는 광고성 메일을 멈춥니다.</p>
          <label className="block text-sm text-sub">
            이메일
            <input className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] text-ink outline-none focus:border-accent" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || !email} className="w-full rounded-2xl bg-accent px-5 py-4 text-[17px] font-semibold text-white disabled:opacity-40">
            {busy ? "처리 중이에요…" : "광고성 메일 수신거부"}
          </button>
          {msg && <p role="alert" className="text-[14px] text-warn">{msg}</p>}
        </form>
      )}
      <p className="mt-8 text-[13px] leading-relaxed text-sub">로그인해 계시다면 내 정보 › 설정에서도 이벤트·혜택 정보 수신을 끌 수 있어요.</p>
    </main>
  );
}
