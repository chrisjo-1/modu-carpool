"use client";
import { useEffect, useState } from "react";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";
type Item = { id: string; where: string; text: string };

/** 관리자 > 사이트: 홈 말풍선 문구(한국어). 비우면 기본 문구. */
export default function AdminBubbles() {
  const [items, setItems] = useState<Item[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [max, setMax] = useState(120);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/bubbles")
      .then((r) => r.json())
      .then((j) => {
        if (!j.items) return setMsg(j.error ?? "불러오지 못했습니다.");
        const t = Object.fromEntries(j.items.map((i: Item) => [i.id, j.texts[i.id] ?? ""]));
        setItems(j.items);
        setMax(j.max);
        setTexts(t);
        setSaved(t);
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/bubbles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    const t = Object.fromEntries(items.map((i) => [i.id, j.texts[i.id] ?? ""]));
    setTexts(t);
    setSaved(t);
    setMsg("저장했어요. 새로고침하면 홈에 바로 보여요.");
  };

  const dirty = JSON.stringify(texts) !== JSON.stringify(saved);

  return (
    <section data-block-id="A231" data-block-name="말풍선 문구" className="max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <p className="text-[15px] font-semibold">말풍선 문구</p>
        <p className="mt-1 text-[13px] leading-relaxed text-sub">홈 화면의 안내 말풍선 문구예요. 로그인한 회원에게만 보여요. 비워 두면 기본 문구를 씁니다. 한국어 화면에만 적용됩니다.</p>
      </div>
      {items.map((i, idx) => (
        <label key={i.id} className="block text-sm text-sub">
          <span className="mb-1 block">{i.where} <span className="text-[12px] text-sub/70">({texts[i.id]?.length ?? 0}/{max})</span></span>
          <input
            data-block-id={`F${115 + idx}`}
            className={input}
            maxLength={max}
            value={texts[i.id] ?? ""}
            placeholder={i.text}
            onChange={(e) => setTexts({ ...texts, [i.id]: e.target.value })}
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" data-block-id="B295" data-block-name="말풍선 문구 저장" disabled={busy || !dirty} onClick={save} className="rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-40">
          {busy ? "저장 중…" : "저장"}
        </button>
        {msg && <p className="text-[14px] text-sub">{msg}</p>}
      </div>
    </section>
  );
}
