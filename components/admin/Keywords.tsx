"use client";
import { useCallback, useEffect, useState } from "react";

type Keyword = { id?: string; label: string };
type Keywords = { gift: Keyword[]; driver: Keyword[]; rider: Keyword[] };
const GROUPS: [keyof Keywords, string, string][] = [
  ["gift", "무료 운행 감사 표시", "무료 운행 글에만 보여요 (운전자·탑승자 공통)"],
  ["driver", "운전자 키워드", "운전자 글을 쓸 때 고를 수 있어요"],
  ["rider", "탑승자 키워드", "탑승자 글을 쓸 때 고를 수 있어요"],
];
const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";

export default function AdminKeywords() {
  const [kw, setKw] = useState<Keywords | null>(null);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/keywords").then((x) => x.json()).catch(() => null);
    if (r?.keywords) {
      setKw(r.keywords);
      setUsed(r.used ?? {});
      setDirty(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const edit = (g: keyof Keywords, fn: (list: Keyword[]) => Keyword[]) => {
    if (!kw) return;
    setKw({ ...kw, [g]: fn([...kw[g]]) });
    setDirty(true);
    setMsg("");
  };
  const save = async () => {
    const r = await fetch("/api/admin/keywords", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kw) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "저장했습니다. 글쓰기 화면에 바로 반영됩니다." : j.error ?? "저장하지 못했습니다.");
    if (r.ok) load();
  };

  if (!kw) return <p className="text-sub">불러오는 중…</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {GROUPS.map(([g, title, help]) => (
          <section key={g} data-block-id={`S130-${g}`} data-block-name={title} className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-xs text-sub">{help}</p>
            </div>
            <ul className="space-y-2">
              {kw[g].map((k, i) => (
                <li key={k.id ?? `new-${i}`} className="flex items-center gap-1.5">
                  <input aria-label={`${title} ${i + 1}`} className={input} maxLength={12} value={k.label} onChange={(e) => edit(g, (l) => { l[i] = { ...l[i], label: e.target.value }; return l; })} />
                  <span className="num w-10 shrink-0 text-right text-xs text-sub" title="이 키워드를 쓴 글 수">{k.id ? used[k.id] ?? 0 : "새"}</span>
                  <button type="button" aria-label="위로" disabled={i === 0} className="min-h-0 rounded-md px-1.5 py-1 text-sub disabled:opacity-30" onClick={() => edit(g, (l) => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; return l; })}>↑</button>
                  <button type="button" aria-label="아래로" disabled={i === kw[g].length - 1} className="min-h-0 rounded-md px-1.5 py-1 text-sub disabled:opacity-30" onClick={() => edit(g, (l) => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; return l; })}>↓</button>
                  <button type="button" data-block-id="B130" data-block-name="키워드 삭제" className="min-h-0 shrink-0 text-sm text-warn underline" onClick={() => { if (!k.id || !used[k.id] || window.confirm(`'${k.label}' 키워드를 삭제하면 이 키워드를 쓴 글 ${used[k.id]}개에서도 사라집니다. 삭제할까요?`)) edit(g, (l) => l.filter((_, j) => j !== i)); }}>삭제</button>
                </li>
              ))}
            </ul>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const label = (adding[g] ?? "").trim(); if (!label) return; edit(g, (l) => [...l, { label }]); setAdding({ ...adding, [g]: "" }); }}>
              <input data-block-id={`F130-${g}`} className={input} maxLength={12} placeholder="새 키워드 (12자 이내)" value={adding[g] ?? ""} onChange={(e) => setAdding({ ...adding, [g]: e.target.value })} />
              <button className="shrink-0 rounded-lg bg-bg px-4 text-sm font-semibold">추가</button>
            </form>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button data-block-id="B131" data-block-name="키워드 저장" disabled={!dirty} className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white disabled:opacity-40" onClick={save}>변경 내용 저장</button>
        {dirty && <button className="text-sm text-sub underline" onClick={load}>되돌리기</button>}
        {msg && <p role="status" className="text-sm text-accent">{msg}</p>}
      </div>
      <p className="text-xs text-sub">이름을 바꾸면 이미 올라간 글에도 새 이름으로 보입니다. 숫자는 그 키워드를 쓴 글 수입니다.</p>
    </div>
  );
}
