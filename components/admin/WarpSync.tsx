"use client";
import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string; warpId: string; role: string; home: string; work: string; homeName: string; workName: string;
  departAt: string; regAt: string; warpState: string; price: number; tags: string;
  status: string; stage: string; note: string; postId: string; label: string; hasAccount: boolean; gone: boolean; canGo: boolean; locked: boolean;
};
type Filter = "all" | "new" | "go" | "queued" | "posted" | "hold" | "excluded";

const TONE: Record<string, string> = {
  "등록 · 메일 보냄": "bg-mintSoft text-mint",
  "등록 · 메일 대기": "bg-accentSoft text-accent",
  "등록 · 메일 못 보냄": "bg-warnSoft text-warn",
  "대기(명단에 없음)": "bg-bg text-sub",
  "처리 중": "bg-accentSoft text-accent",
  "계정 있음": "bg-mintSoft text-mint",
  "계정 없음": "bg-bg text-sub",
  "탈퇴·정지": "bg-warnSoft text-warn",
  "건너뜀": "bg-warnSoft text-warn",
};
const STATE_NAME: Record<string, string> = { open: "대기", past: "시간경과", done: "완료" };
const STATUS_NAME: Record<string, string> = { hold: "보류", excluded: "제외" };
const when = (iso: string) => {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/**
 * 관리자 '워프동기화' 탭(2026-11-04 사용자 지시): 화면에서 확인한 워프 1회 카풀 글을 모아 두는 곳.
 * [목록에 추가]를 누르면 서버가 계정 확인 → 명단에 없으면 대기, 있으면 카풀 등록 → 본인에게 메일(밤 9시~아침 8시는 아침에).
 * 시간경과·완료 글도 올리고 화면에서는 흐리게 '종료'·'마감'으로 보인다.
 */
export default function WarpSync() {
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

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
  const runMsg = (j: { posted?: number; queued?: number; mailed?: number; skipped?: number }) =>
    `등록 ${j.posted ?? 0} · 대기 ${j.queued ?? 0} · 메일 ${j.mailed ?? 0}${j.skipped ? ` · 건너뜀 ${j.skipped}` : ""}. 남은 것은 사이트 접속 때 몇 분마다 이어서 처리해요(밤 9시~아침 8시 메일은 아침에).`;

  const save = async () => {
    const j = await call({ action: "save", text });
    if (!j) return;
    setText("");
    const bad = (j.bad as string[]) ?? [];
    setMsg(`${j.saved}건 저장했어요.${bad.length ? ` 형식이 안 맞은 줄 ${bad.length}개: ${bad.slice(0, 3).join(" / ")}` : ""}`);
  };
  const go = async () => {
    const j = await call({ action: "go", ids: [...sel] });
    if (!j) return;
    setSel(new Set());
    setMsg(runMsg(j));
  };
  const runNow = async () => {
    const j = await call({ action: "run" });
    if (j) setMsg(runMsg(j));
  };
  const mark = async (status: string) => {
    const j = await call({ action: "status", status, ids: [...sel] });
    if (j) setSel(new Set());
  };
  const remove = async () => {
    if (!window.confirm(`${sel.size}건을 지울까요? (이미 등록된 글은 지워지지 않아요)`)) return;
    const j = await call({ action: "delete", ids: [...sel] });
    if (j) setSel(new Set());
  };

  const toggle = (id: string) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const inFilter = (x: Item, f: Filter) =>
    f === "all" ? true
    : f === "new" ? x.status === "new"
    : f === "go" ? x.status === "go" && x.stage === ""
    : f === "queued" ? x.stage === "queued"
    : f === "posted" ? x.stage === "posted" || x.stage === "mailed"
    : x.status === f && !x.postId;
  const shown = items.filter((x) => inFilter(x, filter));
  const goable = items.filter((x) => x.canGo);
  const FILTERS: [Filter, string][] = [["all", "전체"], ["new", "확인 전"], ["go", "처리 중"], ["queued", "대기"], ["posted", "등록됨"], ["hold", "보류"], ["excluded", "제외"]];

  return (
    <div data-block-id="S430" data-block-name="워프동기화" className="space-y-4">
      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[17px] font-bold">워프동기화</h2>
          <button data-block-id="B460" data-block-name="워프동기화 지금 처리" disabled={busy} onClick={runNow} className="min-h-0 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{busy ? "처리 중…" : "지금 처리"}</button>
        </div>
        <p className="mt-1 text-sm text-sub">워프 글을 모두의카풀에 대신 올리는 곳이에요. [목록에 추가]를 누르면 고유번호가 명단에 없으면 대기, 있으면 카풀로 등록하고 본인에게 메일을 보내요. 지난 글·완료 글은 흐리게 보여요. 스크린샷 원본은 저장하지 않아요.</p>

        <div className="mt-3">
          <label className="text-sm font-semibold">여러 건 붙여넣기 (한 줄에 한 건)</label>
          <p className="mt-0.5 text-xs text-sub">순서: 고유번호 | 운전자·탑승자 | 출발 주소 | 도착 주소 | 출발 일시 | 상태(대기·시간경과·완료) | 금액 | 등록 일시. 칸은 | 또는 탭으로 나눠요.</p>
          <textarea data-block-id="F440" value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder={"예) 0247737X|운전자|충남 천안시 동남구 신방동 920|인천 영종구 운서동 2868|2026-10-31 14:00|시간경과||2026-10-31 07:53"}
            className="mt-1 w-full rounded-xl border border-line bg-white p-3 text-[15px] outline-none focus:border-accent" />
          <div className="mt-2 flex justify-end">
            <button data-block-id="B454" data-block-name="워프동기화 저장" disabled={busy || !text.trim()} onClick={save} className="min-h-0 rounded-xl bg-accent px-4 py-2 font-bold text-white disabled:opacity-50">붙여넣은 글 저장</button>
          </div>
        </div>
        {msg && <p className="mt-3 rounded-lg bg-bg px-3 py-2 text-sm text-ink">{msg}</p>}
      </section>

      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`min-h-0 rounded-lg border px-3 py-1.5 text-[14px] ${filter === k ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-sub"}`}>
              {label} ({items.filter((x) => inFilter(x, k)).length})
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-0 rounded-lg border border-line bg-white px-2.5 py-1 text-sm" onClick={() => setSel(new Set(goable.map((x) => x.id)))}>추가할 수 있는 것 모두 선택 ({goable.length})</button>
          <button type="button" className="min-h-0 rounded-lg border border-line bg-white px-2.5 py-1 text-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
        <div className="sticky top-0 z-10 mt-3 flex flex-wrap gap-2 rounded-xl border border-accent bg-accentSoft p-3">
          <button data-block-id="B455" data-block-name="워프동기화 목록에 추가" disabled={busy || !sel.size} onClick={go} className="min-h-0 flex-1 rounded-xl bg-accent py-2.5 font-bold text-white disabled:opacity-50">{`선택한 ${sel.size}건 목록에 추가`}</button>
          <button data-block-id="B456" data-block-name="워프동기화 보류" disabled={busy || !sel.size} onClick={() => mark("hold")} className="min-h-0 rounded-xl border border-line bg-white px-3 py-2.5 font-semibold disabled:opacity-50">보류</button>
          <button data-block-id="B457" data-block-name="워프동기화 제외" disabled={busy || !sel.size} onClick={() => mark("excluded")} className="min-h-0 rounded-xl border border-line bg-white px-3 py-2.5 font-semibold disabled:opacity-50">제외</button>
          <button data-block-id="B458" data-block-name="워프동기화 되돌리기" disabled={busy || !sel.size} onClick={() => mark("new")} className="min-h-0 rounded-xl border border-line bg-white px-3 py-2.5 font-semibold disabled:opacity-50">확인 전으로</button>
          <button data-block-id="B459" data-block-name="워프동기화 삭제" disabled={busy || !sel.size} onClick={remove} className="min-h-0 rounded-xl border border-warn bg-white px-3 py-2.5 font-semibold text-warn disabled:opacity-50">삭제</button>
        </div>

        <div className="mt-3 space-y-2">
          {shown.length === 0 && <p className="py-6 text-center text-sm text-sub">표시할 글이 없어요.</p>}
          {shown.map((x) => (
            <label key={x.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-3 ${x.warpState !== "open" ? "opacity-70" : ""}`}>
              <input type="checkbox" className="mt-1" disabled={!!x.postId} checked={sel.has(x.id)} onChange={() => toggle(x.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">{x.warpId}</span>
                  <span className="text-xs text-sub">{x.role === "driver" ? "운전자" : "탑승자"}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${TONE[x.label] ?? "bg-bg text-sub"}`}>{x.label}</span>
                  {!x.postId && STATUS_NAME[x.status] && <span className="rounded-md bg-warnSoft px-1.5 py-0.5 text-xs font-semibold text-warn">{STATUS_NAME[x.status]}</span>}
                  <span className="rounded-md bg-bg px-1.5 py-0.5 text-xs text-sub">워프 {STATE_NAME[x.warpState] ?? x.warpState}</span>
                </div>
                <p className="mt-1 break-words text-sm text-ink">{x.homeName || x.home} → {x.workName || x.work}</p>
                <p className="mt-0.5 break-words text-xs text-sub">출발 {when(x.departAt)} · {x.price ? `${x.price.toLocaleString("ko-KR")}원` : "금액 없음"}{x.tags ? ` · ${x.tags}` : ""} · 워프 등록 {when(x.regAt)}</p>
                {x.note && <p className="mt-0.5 text-xs text-warn">{x.note}</p>}
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
