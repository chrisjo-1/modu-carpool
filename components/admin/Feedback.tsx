"use client";
import { useCallback, useEffect, useState } from "react";
import { FEEDBACK_STATUS, catLabel, statusLabel } from "@/lib/feedback";

type Item = { id: number; name: string; email: string; member: boolean; category: string; body: string; status: string; reply: string; at: number };
const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";

export default function AdminFeedback() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState<Record<number, { status: string; reply: string }>>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async (f = filter) => {
    const r = await fetch(`/api/admin/feedback?status=${f}`).then((x) => x.json()).catch(() => null);
    if (r?.items) {
      setItems(r.items);
      setCounts(r.counts ?? {});
    }
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (it: Item) => {
    const e = edit[it.id] ?? { status: it.status, reply: it.reply };
    const r = await fetch("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, ...e }) });
    setMsg(r.ok ? (e.reply && e.reply !== it.reply && it.member ? "저장했습니다. 회원에게 답변 알림을 보냈습니다." : "저장했습니다.") : "저장하지 못했습니다.");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[["", "전체"], ...FEEDBACK_STATUS].map(([k, l]) => (
          <button key={k} onClick={() => { setFilter(k); load(k); }} aria-pressed={filter === k} className={`rounded-full border px-4 py-1.5 text-sm ${filter === k ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
            {l}{k && counts[k] ? ` ${counts[k]}` : ""}
          </button>
        ))}
        {msg && <p role="status" className="ml-2 text-sm text-accent">{msg}</p>}
      </div>
      <ul data-block-id="S140" data-block-name="의견 목록" className="space-y-3">
        {items.map((it) => {
          const e = edit[it.id] ?? { status: it.status, reply: it.reply };
          return (
            <li key={it.id} className="space-y-2 rounded-2xl border border-line bg-white p-5 shadow-card">
              <p className="flex flex-wrap items-center gap-2 text-sm text-sub">
                <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-ink">{catLabel(it.category)}</span>
                <span>{it.member ? it.name || "회원" : "비회원"}</span>
                {it.email && <span>{it.email}</span>}
                <span className="num">{new Date(it.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${it.status === "new" ? "bg-warnSoft text-warn" : "bg-accentSoft text-accent"}`}>{statusLabel(it.status)}</span>
              </p>
              <p className="whitespace-pre-wrap break-words text-[15px]">{it.body}</p>
              <div className="flex flex-wrap gap-2">
                <select aria-label="상태" className={`${input} w-32`} value={e.status} onChange={(x) => setEdit({ ...edit, [it.id]: { ...e, status: x.target.value } })}>
                  {FEEDBACK_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <textarea aria-label="답변" className={`${input} min-w-[240px] flex-1`} rows={2} maxLength={2000} placeholder={it.member ? "답변 (회원의 '내가 보낸 의견'에 보이고 푸시로 알림)" : "메모 (비회원은 이메일로 직접 답해 주세요)"} value={e.reply} onChange={(x) => setEdit({ ...edit, [it.id]: { ...e, reply: x.target.value } })} />
                <button data-block-id="B140" data-block-name="의견 저장" className="rounded-lg bg-accent px-4 text-sm font-semibold text-white" onClick={() => save(it)}>저장</button>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && <p className="py-8 text-center text-sub">받은 의견이 없습니다.</p>}
    </div>
  );
}
