"use client";
import { useState } from "react";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-[15px] uppercase outline-none focus:border-accent";

type Check = { code: string; available: boolean } | null;

/**
 * 관리자 > 회원 상세: 고유코드 변경.
 * 새 코드를 입력해 중복을 확인하고, 확인된 코드만 회원에게 적용한다.
 */
export default function MemberCode({ userId, current, onApplied }: { userId: string; current: string; onApplied: (code: string) => void }) {
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<Check>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (data: Record<string, unknown>) => {
    const r = await fetch("/api/admin/member-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, j };
  };

  const doCheck = async () => {
    setMsg("");
    setBusy(true);
    const { ok, j } = await post({ action: "check", code: value });
    setBusy(false);
    if (!ok) {
      setCheck(null);
      return setMsg(j.error ?? "확인하지 못했습니다.");
    }
    setCheck({ code: j.code, available: j.available });
    setMsg(j.available ? "사용할 수 있는 코드입니다." : "이미 사용 중인 코드입니다.");
  };

  const apply = async () => {
    if (!check?.available) return;
    if (!window.confirm(`고유코드를 ${check.code} 로 바꿀까요? 회원이 보는 이름도 함께 바뀔 수 있습니다.`)) return;
    setBusy(true);
    const { ok, j } = await post({ action: "apply", userId, code: check.code });
    setBusy(false);
    if (!ok) {
      setMsg(j.error ?? "적용하지 못했습니다.");
      if (j.available === false) setCheck(null);
      return;
    }
    setMsg(`고유코드를 ${j.code} 로 바꿨습니다.`);
    setCheck(null);
    setValue("");
    onApplied(j.code);
  };

  return (
    <div data-block-id="C232" data-block-name="고유코드 변경" className="mt-4 rounded-xl border border-line bg-white p-3">
      <p className="text-xs text-sub">현재 고유코드</p>
      <p className="mb-3 font-mono text-base font-semibold">{current || "-"}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input data-block-id="F094" aria-label="새 고유코드" placeholder="예: 1234567A" maxLength={12} className={`${input} w-44`} value={value} onChange={(e) => { setValue(e.target.value); setCheck(null); setMsg(""); }} />
        <button data-block-id="B242" type="button" disabled={busy || !value.trim()} onClick={doCheck} className="rounded-lg bg-bg px-4 py-2 text-sm disabled:opacity-50">중복 확인</button>
        <button data-block-id="B243" type="button" disabled={busy || !check?.available} onClick={apply} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">이 코드로 적용</button>
      </div>
      <p className="mt-2 text-xs text-sub">숫자 7자리와 영문 1자리(I, O 제외). 확인을 마친 뒤에만 적용할 수 있고, 입력을 바꾸면 다시 확인해야 합니다.</p>
      {msg && <p role="status" className={`mt-2 text-sm ${check?.available ? "text-accent" : "text-sub"}`}>{msg}</p>}
    </div>
  );
}
