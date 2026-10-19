"use client";
import { useEffect, useState } from "react";

type Row = {
  id: string; status: string; message: string; origin: string; dest: string; role: string; regular: boolean; days: string; time_go: string;
  depart_at: number; created_at: number; req_name: string; req_email: string; req_test: boolean; owner_name: string; owner_email: string;
};
const STATUS: Record<string, string> = { pending: "대기", accepted: "수락", declined: "거절" };
const when = (ms: number) => new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** 관리자: 카풀 신청·매칭 목록. 현황 카드(신청·수락된 매칭)를 누르면 열린다. */
export default function AdminRequests({ initial = "" }: { initial?: string }) {
  const [status, setStatus] = useState(initial);
  const [data, setData] = useState<{ total: number; rows: Row[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => setStatus(initial), [initial]);
  useEffect(() => {
    let live = true;
    setData(null);
    fetch(`/api/admin/requests?status=${status}`)
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.error) setErr(j.error); else { setErr(""); setData(j); } })
      .catch(() => live && setErr("불러오지 못했습니다."));
    return () => { live = false; };
  }, [status]);

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
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
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
                <td className="px-2 py-2">{r.owner_name}<span className="block text-xs text-sub">{r.owner_email}</span></td>
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
