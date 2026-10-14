"use client";
import { useEffect, useState } from "react";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";

/** 관리자 > 사이트: 홈 상단 주제목을 바꾼다. 비우면 기본 문구. */
export default function AdminSite() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [def, setDef] = useState("");
  const [max, setMax] = useState(30);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site")
      .then((r) => r.json())
      .then((j) => {
        if (!j.slogan) return setMsg(j.error ?? "불러오지 못했습니다.");
        setValue(j.slogan);
        setSaved(j.slogan);
        setDef(j.defaultSlogan);
        setMax(j.max);
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/site", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slogan: value }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setSaved(j.slogan);
    setValue(j.slogan);
    setMsg("저장했어요. 새로고침하면 홈에 바로 보여요.");
  };

  return (
    <section data-block-id="A230" data-block-name="사이트 설정" className="max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <p className="text-[15px] font-semibold">홈 상단 주제목</p>
        <p className="mt-1 text-[13px] leading-relaxed text-sub">로고 옆에 보이는 문구예요. 비워 두면 기본 문구(&quot;{def || "같은 방향, 같이 가요"}&quot;)를 씁니다.</p>
      </div>
      <label className="block text-sm text-sub">
        <span className="mb-1 block">문구 ({value.length}/{max})</span>
        <input data-block-id="F114" className={input} maxLength={max} value={value} onChange={(e) => setValue(e.target.value)} placeholder={def} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" data-block-id="B291" data-block-name="주제목 저장" disabled={busy || value.trim() === saved} onClick={save} className="rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-40">
          {busy ? "저장 중…" : "저장"}
        </button>
        {msg && <p className="text-[14px] text-sub">{msg}</p>}
      </div>
    </section>
  );
}
