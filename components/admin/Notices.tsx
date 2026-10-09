"use client";
import { useCallback, useEffect, useState } from "react";

type Row = { id: number; title: string; body: string; label: string; active: boolean; targets: number; pushSent: number; reads: number; at: number };
type Preview = { members: number; pushMembers: number; devices: number; label: string; push: boolean };

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const n = (v: number) => v.toLocaleString("ko-KR");
const call = (method: string, url: string, data?: unknown) =>
  fetch(url, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

const CHIPS: [string, string, "roles" | "genders"][] = [["driver", "운전자", "roles"], ["rider", "탑승자", "roles"], ["female", "여성", "genders"], ["male", "남성", "genders"]];

export default function Notices() {
  const [rows, setRows] = useState<Row[]>([]);
  const [f, setF] = useState({ title: "", body: "", roles: [] as string[], genders: [] as string[], push: true });
  const [pv, setPv] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await call("GET", "/api/admin/notices");
    if (r.ok) setRows(r.j.notices);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    call("GET", `/api/admin/notices?preview=1&roles=${f.roles.join(",")}&genders=${f.genders.join(",")}`).then((r) => r.ok && setPv(r.j));
  }, [f.roles, f.genders]);

  const toggle = (key: string, group: "roles" | "genders") => setF((x) => ({ ...x, [group]: x[group].includes(key) ? x[group].filter((k) => k !== key) : [...x[group], key] }));

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm(`${pv?.label ?? "대상"} ${n(pv?.members ?? 0)}명에게 공지를 올릴까요?${f.push ? ` 푸시 알림도 보냅니다(${n(pv?.pushMembers ?? 0)}명).` : ""}`)) return;
    setBusy(true);
    const r = await call("POST", "/api/admin/notices", f);
    setBusy(false);
    setMsg(r.ok ? `공지를 올렸습니다. 대상 ${n(r.j.targets)}명${f.push ? ` · 푸시 ${n(r.j.pushSent)}명에게 보냄` : ""}` : r.j.error);
    if (r.ok) setF({ title: "", body: "", roles: [], genders: [], push: true });
    load();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={send} data-block-id="S120" data-block-name="공지 작성" className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold">공지 보내기</h2>
        <label className="block text-sm text-sub">제목<input data-block-id="F120" className={`${input} mt-1`} required minLength={2} maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="block text-sm text-sub">내용<textarea data-block-id="F121" className={`${input} mt-1`} rows={5} required minLength={2} maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
        <div>
          <p className="text-sm text-sub">받는 사람 <span className="text-xs">(아무것도 고르지 않으면 전체 회원 · 같은 줄은 '또는', 줄끼리는 '그리고')</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHIPS.map(([k, label, g], i) => (
              <span key={k} className="contents">
                {i === 2 && <span className="mx-1 self-center text-xs text-sub">그리고</span>}
                <button type="button" data-block-id={`B120-${k}`} aria-pressed={f[g].includes(k)} onClick={() => toggle(k, g)} className={`rounded-full border px-4 py-1.5 text-sm ${f[g].includes(k) ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>{label}</button>
              </span>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={f.push} onChange={(e) => setF({ ...f, push: e.target.checked })} />푸시 알림으로도 알리기</label>
        {pv && (
          <p data-block-id="C120" className="rounded-xl bg-bg px-4 py-3 text-sm">
            <b>{pv.label}</b> · 대상 <b className="num">{n(pv.members)}</b>명
            {f.push && <> · 푸시 받는 회원 <b className="num">{n(pv.pushMembers)}</b>명 (기기 {n(pv.devices)}대){!pv.push && <span className="text-warn"> · 푸시 설정 전</span>}</>}
          </p>
        )}
        <p className="text-xs text-sub">대상 회원이 앱을 열면 팝업으로 보이고, 확인하면 다시 뜨지 않습니다. 성별·역할을 고르지 않은 회원은 올린 글·등록한 차량·구 워프 회원 정보로 판단합니다.</p>
        {msg && <p role="status" className="rounded-xl bg-accentSoft px-4 py-2.5 text-sm text-accent">{msg}</p>}
        <button data-block-id="B121" data-block-name="공지 보내기" disabled={busy} className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "보내는 중…" : "공지 보내기"}</button>
      </form>

      <section data-block-id="S121" data-block-name="공지 목록" className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold">보낸 공지</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-sub"><tr>{["보낸 날", "제목", "대상", "확인", "푸시", "상태", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? "" : "text-sub"}>
                  <td className="num whitespace-nowrap px-2 py-2">{new Date(r.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                  <td className="px-2 py-2"><b>{r.title}</b><span className="block max-w-[280px] truncate text-xs text-sub">{r.body}</span></td>
                  <td className="whitespace-nowrap px-2 py-2">{r.label} <span className="num text-xs text-sub">{n(r.targets)}명</span></td>
                  <td className="num px-2 py-2">{n(r.reads)}</td>
                  <td className="num px-2 py-2">{n(r.pushSent)}</td>
                  <td className="px-2 py-2">{r.active ? "게시 중" : "내림"}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <button className="mr-3 min-h-0 text-accent underline" onClick={async () => { await call("PATCH", "/api/admin/notices", { id: r.id, active: !r.active }); load(); }}>{r.active ? "내리기" : "다시 올리기"}</button>
                    <button className="min-h-0 text-warn underline" onClick={async () => { if (window.confirm("이 공지를 삭제할까요?")) { await call("DELETE", `/api/admin/notices?id=${r.id}`); load(); } }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-6 text-center text-sub">보낸 공지가 없습니다.</p>}
        </div>
      </section>
    </div>
  );
}
