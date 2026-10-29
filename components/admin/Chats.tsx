"use client";
import { useEffect, useState } from "react";

type Person = { name: string; email: string; code: string };
type Thread = { id: string; status: string; route: string; postRole: string; applicant: Person; owner: Person; count: number; lastAt: number; seenAt: number | null };
type Msg = { id: string; from: "applicant" | "owner" | "other"; name: string; body: string; hasImage: boolean; at: number };
type Opened = { route: string; first: string; firstAt: number; messages: Msg[] };
type Log = { id: string; requestId: string; reason: string; ip: string; at: number; route: string; people: string };

const input = "w-full rounded-xl border border-line bg-white px-4 py-2.5 text-[15px]";
const when = (ms: number) => new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, string> = { pending: "대기", accepted: "수락", declined: "거절", cancelled: "취소" };
const REASONS = ["매너·안전 점검", "분쟁 문의 확인", "신고 확인", "비용 문제 확인"];
const who = (p: Person) => `${p.name || "-"}${p.code ? ` (${p.code})` : ""}`;

/**
 * 관리자 > 채팅: 회원으로 찾아 카풀 대화방을 고르고, 사유를 적어야 내용을 연다(열람 기록이 남는다).
 * 분쟁·신고·안전 확인 목적으로만 쓴다(처리방침 '채팅 확인:' 줄).
 */
export default function AdminChats() {
  const [q, setQ] = useState("");
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Thread | null>(null);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [err, setErr] = useState("");
  const [log, setLog] = useState<Log[]>([]);

  const loadLog = () =>
    fetch("/api/admin/chats?log=1").then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.ok) setLog(j.log ?? []);
    });
  const loadRecent = async () => {
    setBusy(true);
    const r = await fetch("/api/admin/chats");
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) setThreads(j.threads ?? []);
  };
  useEffect(() => {
    void loadLog();
    void loadRecent();
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return void loadRecent();
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/admin/chats?q=${encodeURIComponent(q.trim())}`);
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "찾지 못했습니다.");
    setThreads(j.threads ?? []);
  };

  const open = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pick) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/admin/chats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: pick.id, reason }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "열지 못했습니다.");
    setOpened(j as Opened);
    void loadLog();
    if (!q.trim()) void loadRecent();
  };

  const close = () => {
    setPick(null);
    setOpened(null);
    setReason("");
    setOther(false);
    setErr("");
  };

  return (
    <section data-block-id="S412" data-block-name="채팅 열람" className="space-y-5">
      <div className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">채팅 확인</h2>
          <button type="button" data-block-id="B418" data-block-name="최근 대화 새로고침" onClick={() => { setQ(""); void loadRecent(); }} className="min-h-0 text-[14px] text-accent underline">최근 대화 보기</button>
        </div>
        <p className="text-[14px] leading-relaxed text-sub">안전·매너 점검과 분쟁 확인에 씁니다. 대화를 열 때마다 사유와 시각이 기록되고 아래 열람 기록에 남습니다. 회원에게는 처리방침과 대화방 안내로 알리고 있습니다.</p>
        <form onSubmit={search} className="flex gap-2">
          <input data-block-id="F412" className={input} placeholder="회원 이메일·닉네임·회원번호 (비우면 최근 대화)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="회원 검색" />
          <button data-block-id="B413" disabled={busy} className="shrink-0 rounded-xl bg-accent px-5 font-semibold text-white disabled:opacity-40">찾기</button>
        </form>
        {err && !pick && <p className="text-[14px] text-warn">{err}</p>}
        {busy && !threads && <p className="text-[14px] text-sub">불러오는 중…</p>}
        {threads && threads.length === 0 && <p className="text-[14px] text-sub">{q.trim() ? "이 회원의 카풀 대화방이 없어요." : "아직 대화가 오간 대화방이 없어요."}</p>}
        {threads && threads.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {threads.map((th) => (
              <li key={th.id}>
                <button type="button" data-block-id="B414" data-block-name="대화방 열기" onClick={() => { setPick(th); setOpened(null); setReason(""); setOther(false); setErr(""); }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{th.seenAt === null || th.lastAt > th.seenAt ? <span className="mr-1.5 rounded bg-warn px-1.5 py-0.5 text-[11px] font-bold text-white">{th.seenAt === null ? "미확인" : "새 대화"}</span> : null}{th.route}</span>
                    <span className="block truncate text-[13px] text-sub">글쓴이 {who(th.owner)} ↔ 신청자 {who(th.applicant)}</span>
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-sub">
                    <span className="block">{STATUS[th.status] ?? th.status} · 메시지 {th.count}</span>
                    <span className="block">{when(th.lastAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 rounded-2xl border border-line bg-white p-5 shadow-card">
        <h3 className="font-semibold">최근 열람 기록</h3>
        {log.length === 0 ? (
          <p className="text-[14px] text-sub">아직 열람 기록이 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-sub">
                <tr><th className="px-2 py-1">시각</th><th className="px-2 py-1">대화</th><th className="px-2 py-1">사유</th><th className="px-2 py-1">접속처</th></tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-2 py-1.5">{when(l.at)}</td>
                    <td className="px-2 py-1.5">{l.route}<span className="block text-sub">{l.people}</span></td>
                    <td className="px-2 py-1.5">{l.reason}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-sub">{l.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pick && (
        <div data-block-id="S413" data-block-name="채팅 내용" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="truncate font-semibold">{pick.route}</h3>
              <button type="button" data-block-id="B415" className="min-h-0 text-sub underline" onClick={close}>닫기</button>
            </div>
            {!opened ? (
              <form onSubmit={open} className="space-y-3 px-5 py-4">
                <p className="text-[14px] text-sub">글쓴이 {who(pick.owner)} ↔ 신청자 {who(pick.applicant)}</p>
                <fieldset className="space-y-2">
                  <legend className="text-[14px] text-sub">열람 사유 (필수, 기록에 남습니다)</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {[...REASONS, "기타"].map((rs) => {
                      const on = rs === "기타" ? other : reason === rs && !other;
                      return (
                        <button key={rs} type="button" data-block-id="B419" data-block-name={`열람 사유 ${rs}`} aria-pressed={on} onClick={() => { if (rs === "기타") { setOther(true); setReason(""); } else { setOther(false); setReason(rs); } }}
                          className={`min-h-0 rounded-full border px-3 py-1.5 text-[14px] ${on ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>{rs}</button>
                      );
                    })}
                  </div>
                  {other && <input data-block-id="F413" className={input} maxLength={200} placeholder="사유를 직접 적어 주세요" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}
                </fieldset>
                {err && <p className="text-[14px] text-warn">{err}</p>}
                <button data-block-id="B416" disabled={busy || reason.trim().length < 2} className="w-full rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-40">{busy ? "여는 중…" : "기록을 남기고 대화 보기"}</button>
              </form>
            ) : (
              <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {opened.first && (
                  <div className="rounded-xl bg-accentSoft px-3 py-2 text-[14px]">
                    <p className="text-[12px] text-sub">신청 메시지 · {when(opened.firstAt)}</p>
                    <p className="whitespace-pre-wrap break-words">{opened.first}</p>
                  </div>
                )}
                {opened.messages.length === 0 && <p className="py-6 text-center text-sub">주고받은 메시지가 없습니다.</p>}
                {opened.messages.map((m) => (
                  <div key={m.id} data-block-id="C413" data-block-name="채팅 메시지" className={`rounded-xl px-3 py-2 text-[14px] ${m.from === "owner" ? "bg-bg" : "border border-line"}`}>
                    <p className="text-[12px] text-sub">
                      <span className="font-semibold text-ink">{m.name || "-"}</span> · {m.from === "owner" ? "글쓴이" : m.from === "applicant" ? "신청자" : "기타"} · {when(m.at)}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.body}{m.hasImage && <span className="text-sub"> [사진]</span>}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
