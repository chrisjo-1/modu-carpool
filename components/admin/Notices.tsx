"use client";
import { useCallback, useEffect, useState } from "react";

type Kind = "notice" | "push" | "both";
type Row = { id: number; kind?: Kind; kindLabel?: string; title: string; body: string; label: string; active: boolean; targets: number; pushSent: number; reads: number; at: number };
type Preview = { members: number; pushMembers: number; devices: number; label: string; push: boolean };

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const n = (v: number) => v.toLocaleString("ko-KR");
const call = (method: string, url: string, data?: unknown) =>
  fetch(url, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }));

const CHIPS: [string, string, "roles" | "genders"][] = [["driver", "운전자", "roles"], ["rider", "탑승자", "roles"], ["female", "여성", "genders"], ["male", "남성", "genders"]];

export default function Notices() {
  const [rows, setRows] = useState<Row[]>([]);
  const [f, setF] = useState({ title: "", body: "", roles: [] as string[], genders: [] as string[], kind: "both" as Kind });
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
    const what = f.kind === "notice" ? "공지를 올릴까요?(팝업·홈 공지 띠)" : f.kind === "push" ? `푸시 알림만 보낼까요?(푸시 받는 ${n(pv?.pushMembers ?? 0)}명)` : `공지를 올리고 푸시 알림도 보낼까요?(푸시 ${n(pv?.pushMembers ?? 0)}명)`;
    if (!window.confirm(`${pv?.label ?? "대상"} ${n(pv?.members ?? 0)}명에게 ${what}`)) return;
    setBusy(true);
    const r = await call("POST", "/api/admin/notices", f);
    setBusy(false);
    setMsg(r.ok ? `${f.kind === "push" ? "푸시 알림을 보내기 시작했습니다" : "공지를 올렸습니다"}. 대상 ${n(r.j.targets)}명${r.j.pushQueued ? ` · 푸시 ${n(r.j.pushQueued)}명에게 보내는 중(목록의 '푸시' 칸에서 보낸 수 확인)` : ""}` : r.j.error ?? "보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    if (r.ok) setF({ title: "", body: "", roles: [], genders: [], kind: "both" });
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
        <div>
          <p className="text-sm text-sub">공지 유형</p>
          <div data-block-id="A120" role="radiogroup" aria-label="공지 유형" className="mt-2 grid grid-cols-3 gap-2">
            {([["notice", "공지만", "앱 팝업·홈 공지 띠"], ["push", "푸시만", "휴대폰 알림만"], ["both", "공지+푸시", "둘 다"]] as [Kind, string, string][]).map(([k, label, sub]) => (
              <button key={k} type="button" role="radio" aria-checked={f.kind === k} data-block-id={`B122-${k}`} onClick={() => setF({ ...f, kind: k })} className={`rounded-xl border px-2 py-2 text-center ${f.kind === k ? "border-accent bg-accentSoft text-accent" : "border-line bg-white text-sub"}`}>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-[11px]">{sub}</span>
              </button>
            ))}
          </div>
        </div>
        {pv && (
          <p data-block-id="C120" className="rounded-xl bg-bg px-4 py-3 text-sm">
            <b>{pv.label}</b> · 대상 <b className="num">{n(pv.members)}</b>명
            {f.kind !== "notice" && <> · 푸시 받는 회원 <b className="num">{n(pv.pushMembers)}</b>명 (기기 {n(pv.devices)}대){!pv.push && <span className="text-warn"> · 푸시 설정 전</span>}</>}
          </p>
        )}
        <p className="text-xs text-sub">받는 사람은 비밀번호 설정을 마친 회원만이에요(구 워프에서 옮겨 와 아직 비밀번호를 정하지 않은 회원·탈퇴 회원 제외). 공지만·공지+푸시: 대상 회원이 앱을 열면 팝업으로 보이고(확인하면 다시 뜨지 않음), 30일 동안 홈 위 공지 띠에 흐릅니다. 푸시만: 휴대폰 알림만 가고, 알림을 누르면 내용이 열립니다. 성별·역할을 고르지 않은 회원은 올린 글·등록한 차량·구 워프 회원 정보로 판단합니다.</p>
        {msg && <p role="status" className="rounded-xl bg-accentSoft px-4 py-2.5 text-sm text-accent">{msg}</p>}
        <button data-block-id="B121" data-block-name="공지 보내기" disabled={busy} className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "보내는 중…" : "공지 보내기"}</button>
      </form>

      <section data-block-id="S121" data-block-name="공지 목록" className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold">보낸 공지</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-sub"><tr>{["보낸 날", "유형", "제목", "대상", "확인", "푸시", "상태", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? "" : "text-sub"}>
                  <td className="num whitespace-nowrap px-2 py-2">{new Date(r.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                  <td className="whitespace-nowrap px-2 py-2">{r.kindLabel ?? "공지만"}</td>
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
