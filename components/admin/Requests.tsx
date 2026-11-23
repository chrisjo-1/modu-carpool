"use client";
import { useEffect, useState } from "react";

type Owner = { id: string; code: string; phone: string; warpId: string; push: number; state: string; lastSeen: string | null; invited: string | null; mailed: string | null; warpPost: boolean };
type Row = {
  id: string; status: string; message: string; origin: string; dest: string; role: string; regular: boolean; days: string; time_go: string;
  depart_at: number; created_at: number; req_name: string; req_email: string; req_test: boolean; owner_name: string; owner_email: string;
  owner: Owner | null;
};
const dash = (p: string) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }) : "");
const ago = (s: string | null) => {
  if (!s) return "접속 없음";
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  return d <= 0 ? "오늘 접속" : `${d}일 전 접속`;
};
/** 정보통신망법: 밤 9시~아침 8시에는 문자를 피한다 */
const quiet = () => {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false }));
  return h >= 21 || h < 8;
};
const STATUS: Record<string, string> = { pending: "대기", accepted: "수락", declined: "거절" };
const when = (ms: number) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** 관리자: 카풀 신청·매칭 목록. 현황 카드(신청·수락된 매칭)를 누르면 열린다. */
export default function AdminRequests({ initial = "" }: { initial?: string }) {
  const [status, setStatus] = useState(initial);
  const [data, setData] = useState<{ total: number; rows: Row[] } | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState<{ id: string; phone: string; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  const post = async (data: object) => {
    const r = await fetch("/api/admin/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    return r.json().catch(() => ({ error: "응답을 읽지 못했어요." }));
  };
  // 수락 대기 신청의 글쓴이에게 안내 메일(같은 글쓴이는 한 통, 하루 한 번)
  const mail = async (ids: string[], key: string) => {
    setBusy(key);
    setNote("");
    const j = await post({ action: "mail", ids });
    setBusy("");
    if (j.error) return setNote(j.error);
    const skip = Object.entries(j.skipped ?? {}).map(([k, n]) => `${k} ${n}`).join(", ");
    setNote(`메일 ${j.sent}통 보냄${skip ? ` · 건너뜀: ${skip}` : ""}`);
    setReload((v) => v + 1);
  };
  const sms = async (r: Row) => {
    if (!r.owner?.phone) return;
    setBusy(`s${r.id}`);
    const j = await post({ action: "sms", id: r.id });
    setBusy("");
    if (j.error) return setNote(j.error);
    setDraft({ id: r.id, phone: r.owner.phone, text: j.text });
    setReload((v) => v + 1);
  };
  const smsHref = (phone: string, text: string) => `sms:${phone}${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(text)}`;
  const pendingIds = (data?.rows ?? []).filter((r) => r.status === "pending" && r.owner && r.owner.state !== "탈퇴" && r.owner.state !== "정지").map((r) => r.id);

  useEffect(() => setStatus(initial), [initial]);
  useEffect(() => {
    let live = true;
    setData(null);
    fetch(`/api/admin/requests?status=${status}`)
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.error) setErr(j.error); else { setErr(""); setData(j); } })
      .catch(() => live && setErr("불러오지 못했습니다."));
    return () => { live = false; };
  }, [status, reload]);

  return (
    <section data-block-id="S098" data-block-name="신청 목록" className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">신청·매칭 <span className="text-sm font-normal text-sub">{data ? `${data.total.toLocaleString()}건${data.total > 200 ? " 중 최근 200건" : ""}` : "불러오는 중"}</span></h2>
        <div className="flex gap-1" role="group" aria-label="신청 상태">
          {[["", "전체"], ["pending", "대기"], ["accepted", "수락"], ["declined", "거절"]].map(([k, label]) => (
            <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)} className={`rounded-full px-3 py-1.5 text-sm ${status === k ? "bg-accent font-semibold text-white" : "bg-bg text-sub"}`}>{label}</button>
          ))}
        </div>
      </div>
      {err && <p className="mt-3 text-sm text-warn">{err}</p>}
      {pendingIds.length > 0 && (
        <div data-block-id="C459" data-block-name="수락 대기 안내" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-sm">
          <span>수락 대기 {pendingIds.length}건 · 글쓴이에게 알리면 답이 빨라져요. 전화번호 열람은 기록돼요.</span>
          <button type="button" data-block-id="B521" data-block-name="대기 글쓴이 모두에게 메일" disabled={!!busy} onClick={() => mail(pendingIds, "all")}
            className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-60">{busy === "all" ? "보내는 중…" : "대기 중인 글쓴이 모두에게 메일"}</button>
          {note && <span className="text-sub">{note}</span>}
        </div>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="text-sub">
            <tr>{["신청일", "글 경로", "일정", "신청자", "글쓴이", "상태"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="num whitespace-nowrap px-2 py-2">{when(r.created_at)}</td>
                <td className="px-2 py-2">{r.origin} → {r.dest}<span className="block text-xs text-sub">{r.role === "driver" ? "운전자 글" : "탑승자 글"}{r.message ? ` · ${r.message}` : ""}</span></td>
                <td className="num whitespace-nowrap px-2 py-2">{r.regular ? `정기 ${r.days} ${r.time_go}` : when(r.depart_at)}</td>
                <td className="px-2 py-2">{r.req_name}{r.req_test && <span className="ml-1 rounded-full bg-accentSoft px-2 py-0.5 text-xs text-accent">테스트</span>}<span className="block text-xs text-sub">{r.req_email}</span></td>
                <td className="px-2 py-2">
                  {r.owner?.code || r.owner_name}<span className="block text-xs text-sub">{r.owner_email}</span>
                  {r.owner && (
                    <div className="mt-1 space-y-1">
                      <span className="block text-xs text-sub">
                        <b className={r.owner.state === "가입 완료" ? "text-mint" : "text-warn"}>{r.owner.state}</b> · 알림 기기 {r.owner.push} · {ago(r.owner.lastSeen)}{r.owner.warpPost ? " · 워프동기화 글" : ""}
                        {r.owner.mailed ? ` · 메일 ${day(r.owner.mailed)}` : ""}{r.owner.invited ? ` · 링크 ${day(r.owner.invited)}` : ""}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.owner.phone ? <a href={`tel:${r.owner.phone}`} className="rounded-md border border-line px-2 py-1 text-xs font-semibold tabular-nums">{dash(r.owner.phone)}</a> : <span className="text-xs text-sub">전화번호 없음</span>}
                        <button type="button" data-block-id="B522" data-block-name="글쓴이 메일" disabled={!!busy} onClick={() => mail([r.id], `m${r.id}`)} className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{busy === `m${r.id}` ? "…" : "메일"}</button>
                        {r.owner.phone && <button type="button" data-block-id="B523" data-block-name="글쓴이 문자" disabled={!!busy} onClick={() => sms(r)} className="rounded-md border border-brand px-2 py-1 text-xs font-semibold text-brand disabled:opacity-60">{busy === `s${r.id}` ? "…" : "문자"}</button>}
                      </div>
                      {draft?.id === r.id && (
                        <div data-block-id="C461" className="space-y-1.5 rounded-lg bg-bg p-2">
                          <textarea className="h-28 w-full rounded-md border border-line bg-white p-2 text-xs" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
                          {quiet() && <p className="text-xs font-semibold text-warn">지금은 밤 9시~아침 8시예요. 문자는 아침 8시 뒤에 보내 주세요.</p>}
                          <div className="flex gap-1.5">
                            <a href={smsHref(draft.phone, draft.text)} className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white">문자 앱 열기</a>
                            <button type="button" className="rounded-md border border-line bg-white px-2 py-1 text-xs" onClick={() => navigator.clipboard?.writeText(draft.text).then(() => setNote("문구를 복사했어요."), () => setNote("복사하지 못했어요."))}>문구 복사</button>
                            <button type="button" className="px-1 text-xs text-sub underline" onClick={() => setDraft(null)}>닫기</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2"><span className={r.status === "accepted" ? "font-semibold text-accent" : r.status === "declined" ? "text-sub" : ""}>{STATUS[r.status] ?? r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && <p className="py-6 text-center text-sub">신청이 없습니다.</p>}
      </div>
    </section>
  );
}
