"use client";
import { useCallback, useEffect, useState } from "react";

type Item = { warpId: string; role: string; home: string; work: string; timeGo: string; regDate: string; status: string; added: boolean; inPool: boolean; hasAccount: boolean; gone: boolean; label: string; canAdd: boolean };

const LABEL_TONE: Record<string, string> = {
  "계정 있음": "bg-mintSoft text-mint",
  "계정 없음(대기)": "bg-bg text-sub",
  "이미 있음": "bg-bg text-sub",
  "목록에 추가됨": "bg-accentSoft text-accent",
  "탈퇴·정지": "bg-warnSoft text-warn",
};
const STATUS_NAME: Record<string, string> = { hold: "보류", excluded: "제외" };

/**
 * 관리자 '워프동기화' 탭(2026-11-04 사용자 지시): 화면에서 확인한 워프 글을 모아 두고, [목록에 추가]를 눌러야 워프 정기카풀 목록으로 넘어간다.
 * 넘어간 뒤 위치 채우기·올리기·알림은 '정기 매칭' 탭에서 한다.
 */
export default function WarpSync() {
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "hold" | "excluded" | "added">("all");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/warp-sync");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "목록을 불러오지 못했어요.");
    setItems(j.items ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/warp-sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(j.error ?? "처리하지 못했어요.");
      return null;
    }
    await load();
    return j;
  };

  const save = async () => {
    const j = await call({ action: "save", text });
    if (!j) return;
    setText("");
    const bad = (j.bad as string[]) ?? [];
    setMsg(`${j.saved}건 저장했어요.${bad.length ? ` 형식이 안 맞은 줄 ${bad.length}개: ${bad.slice(0, 3).join(" / ")}` : ""}`);
  };

  const add = async () => {
    const ids = [...sel];
    const j = await call({ action: "add", ids });
    if (!j) return;
    setSel(new Set());
    const skipped = (j.skipped as { warpId: string; why: string }[]) ?? [];
    setMsg(`${j.added}건을 워프 정기카풀 목록에 넣었어요.${skipped.length ? ` 건너뜀 ${skipped.length}건(${skipped.slice(0, 3).map((x) => `${x.warpId} ${x.why}`).join(", ")})` : ""} 위치 채우기·올리기는 '정기 매칭' 탭에서 해 주세요.`);
  };

  const mark = async (status: string) => {
    const j = await call({ action: "status", status, ids: [...sel] });
    if (j) setSel(new Set());
  };

  const remove = async () => {
    if (!window.confirm(`${sel.size}건을 워프동기화 목록에서 지울까요? (목록에 추가된 글은 지워지지 않아요)`)) return;
    const j = await call({ action: "delete", ids: [...sel] });
    if (j) setSel(new Set());
  };

  const toggle = (id: string) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = items.filter((x) => filter === "all" ? true : filter === "added" ? x.added : x.status === filter && !x.added);
  const addable = items.filter((x) => x.canAdd);
  const counts = {
    all: items.length,
    new: items.filter((x) => x.status === "new" && !x.added).length,
    hold: items.filter((x) => x.status === "hold" && !x.added).length,
    excluded: items.filter((x) => x.status === "excluded" && !x.added).length,
    added: items.filter((x) => x.added).length,
  };

  return (
    <div data-block-id="S430" data-block-name="워프동기화" className="space-y-4">
      <section className="rounded-2xl border border-line bg-white p-4">
        <h2 className="text-[17px] font-bold">워프동기화</h2>
        <p className="mt-1 text-sm text-sub">화면에서 확인한 워프 글을 모아 두는 곳이에요. 스크린샷 원본은 저장하지 않아요. [목록에 추가]를 눌러야 워프 정기카풀 목록으로 넘어가고, 이미 있는 글은 건드리지 않아요.</p>

        <div className="mt-3">
          <label className="text-sm font-semibold">여러 건 붙여넣기 (한 줄에 한 건)</label>
          <p className="mt-0.5 text-xs text-sub">순서: 고유번호 · 운전자/탑승자 · 출발 · 도착 · 출근 시각(없으면 비움) · 등록일(예: 2026-11-04). 탭, 쉼표, | 로 구분해요.</p>
          <textarea data-block-id="F440" value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"0247737X\t운전자\t충남 천안시 동남구 신방동 920\t인천 영종구 운서동 2868\t14:00\t2026-10-31"}
            className="mt-1 w-full rounded-xl border border-line bg-white p-3 text-[15px] outline-none focus:border-accent" />
          <div className="mt-2 flex justify-end">
            <button data-block-id="B454" data-block-name="워프동기화 저장" disabled={busy || !text.trim()} onClick={save} className="min-h-0 rounded-xl bg-accent px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? "처리 중…" : "붙여넣은 글 저장"}</button>
          </div>
        </div>
        {msg && <p className="mt-3 rounded-lg bg-bg px-3 py-2 text-sm text-ink">{msg}</p>}
      </section>

      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {([["all", "전체"], ["new", "대기 중"], ["hold", "보류"], ["excluded", "제외"], ["added", "목록에 추가됨"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`min-h-0 rounded-lg border px-3 py-1.5 text-[14px] ${filter === k ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-sub"}`}>
              {label} ({counts[k]})
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-0 rounded-lg border border-line bg-white px-2.5 py-1 text-sm" onClick={() => setSel(new Set(addable.map((x) => x.warpId)))}>추가 가능한 것 모두 선택 ({addable.length})</button>
          <button type="button" className="min-h-0 rounded-lg border border-line bg-white px-2.5 py-1 text-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
        <div className="sticky top-0 z-10 mt-3 flex flex-wrap gap-2 rounded-xl border border-accent bg-accentSoft p-3">
          <button data-block-id="B455" data-block-name="워프동기화 목록에 추가" disabled={busy || !sel.size} onClick={add} className="min-h-0 flex-1 rounded-xl bg-accent py-2.5 font-bold text-white disabled:opacity-50">{`선택한 ${sel.size}건 목록에 추가`}</button>
          <button data-block-id="B456" data-block-name="워프동기화 보류" disabled={busy || !sel.size} onClick={() => mark("hold")} className="min-h-0 rounded-xl border border-line bg-white px-3 py-2.5 font-semibold disabled:opacity-50">보류</button>
          <button data-block-id="B457" data-block-name="워프동기화 제외" disabled={busy || !sel.size} onClick={() => mark("excluded")} className="min-h-0 rounded-xl border border-line bg-white px-3 py-2.5 font-semibold disabled:opacity-50">제외</button>
          <button data-block-id="B458" data-block-name="워프동기화 되돌리기" disabled={busy || !sel.size} onClick={() => mark("new")} className="min-h-0 rounded-xl border border-line bg-white px-3 py-2.5 font-semibold disabled:opacity-50">대기로</button>
          <button data-block-id="B459" data-block-name="워프동기화 삭제" disabled={busy || !sel.size} onClick={remove} className="min-h-0 rounded-xl border border-warn bg-white px-3 py-2.5 font-semibold text-warn disabled:opacity-50">삭제</button>
        </div>

        <div className="mt-3 space-y-2">
          {shown.length === 0 && <p className="py-6 text-center text-sm text-sub">표시할 글이 없어요.</p>}
          {shown.map((x) => (
            <label key={x.warpId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-3">
              <input type="checkbox" className="mt-1" disabled={x.added} checked={sel.has(x.warpId)} onChange={() => toggle(x.warpId)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">{x.warpId}</span>
                  <span className="text-xs text-sub">{x.role === "driver" ? "운전자" : "탑승자"}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${LABEL_TONE[x.label] ?? "bg-bg text-sub"}`}>{x.label}</span>
                  {x.status !== "new" && !x.added && <span className="rounded-md bg-warnSoft px-1.5 py-0.5 text-xs font-semibold text-warn">{STATUS_NAME[x.status] ?? x.status}</span>}
                </div>
                <p className="mt-1 break-words text-sm text-ink">{x.home} → {x.work}</p>
                <p className="mt-0.5 text-xs text-sub">출근 {x.timeGo || "시각 없음"} · 퇴근 비움 · 등록 {x.regDate || "-"}</p>
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
