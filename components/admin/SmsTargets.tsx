"use client";
import { useState } from "react";

type G = { group: string; label: string; total: number; phone: number; newWarp: number; newWarpPhone: number; oldWarp: number; oldWarpPhone: number };
const f = (v: number) => v.toLocaleString("ko-KR");
const NOTE: Record<string, string> = {
  apple: "대량 메일에서 빠져 한 번도 못 받은 분",
  bad: "반송됐거나 주소가 비었거나 형식이 틀린 분",
  unread: "메일 받고 2일 지났는데 열어 본 기록이 없는 분 (10/29 전 메일은 열람 기록이 없어 여기에 들어가요)",
  none: "아직 메일을 안 보낸 분 — 문자보다 메일을 먼저 보내요",
};

/** 문자·알림톡 안내 대상(워프 회원 유입용). 여는 데 시간이 걸려 [불러오기]를 눌러야 센다. */
export default function SmsTargets() {
  const [g, setG] = useState<G[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/admin/sms-targets");
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).error ?? "불러오지 못했습니다.");
    setG((await r.json()).groups);
  };
  const sendable = g ? g.filter((x) => x.group !== "none").reduce((s, x) => s + x.phone, 0) : 0;
  return (
    <section data-block-id="S422" data-block-name="문자·알림톡 대상" className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold">문자 · 알림톡 대상 (워프 회원 유입)</h2>
          <p className="text-[13px] text-sub">메일로 알리지 못한 워프 회원이에요. 이미 모두의카풀을 쓰는 분(비번 설정·접속)과 탈퇴한 분은 빠져요. 전화번호는 명단에 넣지 않고 있음(O/X)만 보여요 — 문자는 업체 연결 뒤 서버에서 보냅니다.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" data-block-id="B475" onClick={load} disabled={busy} className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink disabled:opacity-50">{busy ? "세는 중…" : g ? "다시 세기" : "인원 세기"}</button>
          <a href="/api/admin/sms-targets?csv=all" data-block-id="B476" className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink">전체 명단 (CSV)</a>
        </div>
      </div>
      {err && <p className="text-sm text-warn">{err}</p>}
      {g && (
        <>
          <p className="text-[15px]">지금 문자로 안내할 인원(아이폰·반송·안 열어 봄, 전화 있음): <b>{f(sendable)}명</b></p>
          <div className="grid gap-3 md:grid-cols-2">
            {g.map((x) => (
              <div key={x.group} className="space-y-1 rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{x.label} <span className="text-sub">{f(x.total)}명</span></p>
                  <a href={`/api/admin/sms-targets?csv=${x.group}`} className="text-[13px] font-semibold text-accent">CSV</a>
                </div>
                <p className="text-[13px] text-sub">{NOTE[x.group]}</p>
                <p className="text-[14px]">전화 있음 {f(x.phone)} · 신워프 {f(x.newWarp)}(전화 {f(x.newWarpPhone)}) · 구워프 {f(x.oldWarp)}(전화 {f(x.oldWarpPhone)})</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
