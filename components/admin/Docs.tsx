"use client";
import { useEffect, useState } from "react";
import DocView from "@/components/DocView";

type Doc = { body: string; updatedAt: number | null };
const KEYS = [["terms", "이용약관"], ["privacy", "개인정보 처리방침"]] as const;

/** 관리자 > 약관: 이용약관·개인정보 처리방침 편집과 미리보기 */
export default function AdminDocs() {
  const [k, setK] = useState<"terms" | "privacy">("terms");
  const [docs, setDocs] = useState<Record<string, Doc> | null>(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/docs").then((r) => r.json()).then((j) => j.terms && setDocs(j)).catch(() => {});
  }, []);
  useEffect(() => {
    if (docs) setDraft(docs[k].body);
  }, [docs, k]);
  useEffect(() => setMsg(""), [k]);

  if (!docs) return <p className="text-sub">불러오는 중…</p>;
  const cur = docs[k];
  const dirty = draft !== cur.body;
  const placeholders = (draft.match(/\[[^\]]{1,12}\]/g) ?? []).filter((x, i, a) => a.indexOf(x) === i);

  const save = async () => {
    const r = await fetch("/api/admin/docs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: k, body: draft }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setDocs({ ...docs, [k]: j.doc });
    setMsg("저장했습니다. 바로 공개 화면에 반영됩니다.");
  };

  return (
    <section data-block-id="A201" data-block-name="약관 관리" className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        {KEYS.map(([id, label]) => (
          <button key={id} aria-pressed={k === id} onClick={() => setK(id)} className={`rounded-lg px-3 text-[14px] ${k === id ? "bg-ink font-semibold text-white" : "bg-bg text-sub"}`}>{label}</button>
        ))}
        <span className="ml-auto text-[13px] text-sub">{cur.updatedAt ? `마지막 저장 ${new Date(cur.updatedAt).toLocaleString("ko-KR")}` : "기본 초안 (아직 저장 안 함)"}</span>
      </div>
      {placeholders.length > 0 && (
        <p className="rounded-lg bg-[#FFF7E6] px-3 py-2 text-[13px] text-[#7A4A00]">아직 채우지 않은 칸: {placeholders.join(", ")} — 사업자 정보로 바꿔 주세요. 법률 검토를 권장합니다.</p>
      )}
      <div className="flex gap-2 text-[14px]">
        <button onClick={() => setView("edit")} aria-pressed={view === "edit"} className={`min-h-0 rounded-md px-3 py-1 ${view === "edit" ? "bg-accentSoft font-semibold text-accent" : "text-sub"}`}>편집</button>
        <button onClick={() => setView("preview")} aria-pressed={view === "preview"} className={`min-h-0 rounded-md px-3 py-1 ${view === "preview" ? "bg-accentSoft font-semibold text-accent" : "text-sub"}`}>미리보기</button>
        <a href={`/${k}`} target="_blank" rel="noreferrer" className="ml-auto self-center text-accent underline">공개 화면 열기</a>
      </div>
      {view === "edit" ? (
        <>
          <textarea data-block-id="F205" aria-label="약관 내용" className="h-[480px] w-full rounded-lg border border-line p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-accent" value={draft} onChange={(e) => { setDraft(e.target.value); setMsg(""); }} />
          <p className="text-[12px] text-sub"># 제목, ## 소제목, 1. 번호 목록, - 글머리, | 표 | 를 쓸 수 있어요.</p>
        </>
      ) : (
        <div className="max-h-[560px] overflow-y-auto rounded-lg border border-line p-4"><DocView body={draft} /></div>
      )}
      <div className="flex items-center gap-3">
        <button data-block-id="B203" data-block-name="약관 저장" disabled={!dirty} onClick={save} className="rounded-xl bg-accent px-5 text-[15px] font-semibold text-white disabled:opacity-40">저장</button>
        {dirty && <button className="min-h-0 text-[14px] text-sub underline" onClick={() => setDraft(cur.body)}>되돌리기</button>}
        {msg && <span role="status" className="text-[14px] text-sub">{msg}</span>}
      </div>
    </section>
  );
}
