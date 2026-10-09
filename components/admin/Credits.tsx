"use client";
import { useCallback, useEffect, useState } from "react";

type Rules = { signup: number; attend: number; post: number; nudge: number; legacy: number };
type Row = { id: number; amount: number; reason: string; memo: string; created_at: number; user_id: string; name: string; email: string; credits: number };
type Data = { rules: Rules; labels: Record<string, string>; totals: { issued: number; used: number; balance: number; attendToday: number }; ledger: Row[] };

const input = "rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const n = (v: number) => v.toLocaleString("ko-KR");
const call = (method: string, url: string, data?: unknown) =>
  fetch(url, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

const RULE_ROWS: [keyof Rules, string, string][] = [
  ["signup", "가입 축하", "가입할 때 한 번 (기존 회원은 내 정보를 처음 열 때)"],
  ["legacy", "워프 회원 이전 축하", "구 워프 가입 이메일로 가입한 회원에게 한 번 (추가 지급)"],
  ["attend", "출석하기", "하루 한 번, 내 정보의 출석 버튼"],
  ["post", "카풀 게시", "하루 한 번, 일회성·정기카풀 글 등록"],
  ["nudge", "메일로 알리기 (차감)", "채팅에서 메일 발송에 성공했을 때만"],
];

export default function Credits() {
  const [d, setD] = useState<Data | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [q, setQ] = useState("");
  const [give, setGive] = useState({ email: "", amount: "", memo: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async (query = "") => {
    const r = await call("GET", `/api/admin/credits?q=${encodeURIComponent(query)}`);
    if (!r.ok) return setMsg(r.j.error ?? "불러오지 못했습니다.");
    setD(r.j);
    setRules(r.j.rules);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const saveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await call("PATCH", "/api/admin/credits", rules);
    setMsg(r.ok ? "적립 기준을 저장했습니다. 바로 적용됩니다." : r.j.error);
    load(q);
  };
  const adjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(give.amount);
    if (!window.confirm(`${give.email} 회원에게 ${amount > 0 ? `${n(amount)} 크레딧을 지급` : `${n(-amount)} 크레딧을 회수`}할까요?`)) return;
    const r = await call("POST", "/api/admin/credits", { email: give.email, amount, memo: give.memo });
    setMsg(r.ok ? `처리했습니다. 현재 잔액 ${n(r.j.credits)}` : r.j.error);
    if (r.ok) setGive({ email: "", amount: "", memo: "" });
    load(q);
  };

  const t = d?.totals;
  return (
    <div className="space-y-6">
      <section data-block-id="S110" data-block-name="크레딧 현황" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["지급 누계", t ? n(t.issued) : "—"],
          ["사용·회수 누계", t ? n(t.used) : "—"],
          ["회원 보유 합계", t ? n(t.balance) : "—"],
          ["오늘 출석", t ? `${n(t.attendToday)}명` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="text-sm text-sub">{k}</p>
            <p className="num mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </section>
      {msg && <p role="status" className="rounded-xl bg-accentSoft px-4 py-2.5 text-sm text-accent">{msg}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={saveRules} data-block-id="S111" data-block-name="적립 기준" className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold">적립·차감 기준</h2>
          {rules && RULE_ROWS.map(([k, label, help]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm">
              <span><b>{label}</b><span className="block text-xs text-sub">{help}</span></span>
              <input data-block-id={`F110-${k}`} className={`${input} num w-28 text-right`} type="number" min={0} max={1000000} required value={rules[k]} onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value) })} />
            </label>
          ))}
          <p className="text-xs text-sub">0으로 두면 그 항목은 지급(차감)하지 않습니다. 바꾼 값은 저장 즉시 적용되고, 이미 지급된 크레딧은 바뀌지 않습니다.</p>
          <button data-block-id="B110" data-block-name="기준 저장" className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white">기준 저장</button>
        </form>

        <form onSubmit={adjust} data-block-id="S112" data-block-name="크레딧 지급·회수" className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold">회원 지급·회수</h2>
          <label className="block text-sm text-sub">회원 이메일<input data-block-id="F111" className={`${input} mt-1 w-full`} type="email" required value={give.email} onChange={(e) => setGive({ ...give, email: e.target.value })} /></label>
          <label className="block text-sm text-sub">크레딧 (회수는 앞에 −, 예: -500)<input data-block-id="F112" className={`${input} num mt-1 w-full`} type="number" required value={give.amount} onChange={(e) => setGive({ ...give, amount: e.target.value })} /></label>
          <label className="block text-sm text-sub">사유 (회원 내역에 보입니다)<input data-block-id="F113" className={`${input} mt-1 w-full`} required minLength={2} maxLength={100} placeholder="예: 이벤트 당첨, 부정 적립 회수" value={give.memo} onChange={(e) => setGive({ ...give, memo: e.target.value })} /></label>
          <button data-block-id="B111" data-block-name="지급·회수" className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white">처리하기</button>
          <p className="text-xs text-sub">회수해도 잔액은 0 아래로 내려가지 않습니다.</p>
        </form>
      </div>

      <section data-block-id="S113" data-block-name="크레딧 내역" className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">최근 내역</h2>
          <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="flex gap-2">
            <input className={`${input} w-56`} type="search" placeholder="이메일·닉네임" aria-label="내역 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="rounded-lg bg-bg px-4 text-sm">검색</button>
          </form>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] whitespace-nowrap text-left text-sm">
            <thead className="text-sub"><tr>{["일시", "회원", "구분", "사유", "변동", "현재 잔액"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {(d?.ledger ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="num px-2 py-2">{new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                  <td className="px-2 py-2">{r.name} <span className="text-xs text-sub">{r.email}</span></td>
                  <td className="px-2 py-2">{d?.labels[r.reason] ?? r.reason}</td>
                  <td className="max-w-[220px] truncate px-2 py-2 text-sub">{r.memo}</td>
                  <td className={`num px-2 py-2 font-semibold ${r.amount > 0 ? "text-accent" : "text-warn"}`}>{r.amount > 0 ? "+" : "−"}{n(Math.abs(r.amount))}</td>
                  <td className="num px-2 py-2">{n(r.credits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(d?.ledger ?? []).length === 0 && <p className="py-6 text-center text-sub">내역이 없습니다.</p>}
        </div>
      </section>
    </div>
  );
}
