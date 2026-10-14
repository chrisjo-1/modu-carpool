"use client";
import { useEffect, useState } from "react";

type Row = { id: string; created_at: string; radius_km: number; origin: string | null; dest: string | null; recipients: number; accepts: number; name?: string; email?: string };

const when = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 관리자 > CALL: 최근 호출 이력. 알림 인원과 수락 인원을 보여 준다. */
export default function AdminCallHistory() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/calls")
      .then((r) => r.json())
      .then((j) => {
        if (!j.calls) return setMsg(j.error ?? "불러오지 못했습니다.");
        setRows(j.calls);
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  }, []);

  return (
    <section data-block-id="S145" data-block-name="CALL 이력" className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <h2 className="text-lg font-semibold">CALL 이력</h2>
      <p className="mt-1 text-sm text-sub">최근 200건. 알림은 호출 반경 안의 회원에게 보낸 수, 수락은 실제로 수락한 수입니다.</p>
      {msg && <p role="status" className="mt-3 text-sm text-warn">{msg}</p>}
      {!msg && rows === null && <p className="mt-3 text-sm text-sub">불러오는 중…</p>}
      {rows && rows.length === 0 && <p className="mt-3 text-sm text-sub">아직 CALL 이력이 없어요.</p>}
      {rows && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-sub">
              <tr>{["시각", "호출자", "경로", "반경", "알림", "수락"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num whitespace-nowrap px-2 py-2">{when(r.created_at)}</td>
                  <td className="px-2 py-2">{r.name} <span className="text-sub">{r.email}</span></td>
                  <td className="px-2 py-2">{r.origin && r.dest ? `${r.origin} → ${r.dest}` : <span className="text-sub">삭제된 글</span>}</td>
                  <td className="num px-2 py-2">{r.radius_km}km</td>
                  <td className="num px-2 py-2">{r.recipients.toLocaleString("ko-KR")}명</td>
                  <td className="num px-2 py-2">{r.accepts.toLocaleString("ko-KR")}명</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
