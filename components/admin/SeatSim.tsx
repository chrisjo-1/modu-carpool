"use client";
import { useState } from "react";
import { ALL_LINES, LINE_STATIONS } from "@/lib/subway";

type Summary = { users: number; pairsTested: number; matches: number; takers: number; unmatched: number; byStops: number[]; avgGap: number };
type SimUser = { id: number; line: string; board: string; alight: string; next: string; time: string; days: string; car: string; gate: string };
type SimMatch = { taker: number; giver: number; stops: number; seatStation: string; meetStation: string; gapMin: number; car: string; gate: string };
type PerUser = { id: number; takeCount: number; giveCount: number; best: { role: "take" | "give"; with: number; stops: number; gapMin: number } | null };
type Result = { kind: "go" | "back"; summary: Summary; users: SimUser[]; matches: SimMatch[]; perUser: PerUser[] };
const WINDOW: Record<"go" | "back", [string, string]> = { go: ["07:00", "09:00"], back: ["18:00", "20:00"] };

const input = "rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const lineName = (id: string) => ALL_LINES.find((l) => l.id === id)?.name ?? id;
const PILOT = ["2", "5"];

/** 앉아가기 시뮬레이션: 가상 회원을 만들어 실제 매칭 규칙을 돌린다. 실제 회원 데이터는 쓰지 않는다. */
export default function AdminSeatSim() {
  const [line, setLine] = useState("2");
  const [kind, setKind] = useState<"go" | "back">("go");
  const [count, setCount] = useState(40);
  const [seed, setSeed] = useState(1);
  const [from, setFrom] = useState(WINDOW.go[0]);
  const [to, setTo] = useState(WINDOW.go[1]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [res, setRes] = useState<Result | null>(null);

  const pickKind = (k: "go" | "back") => {
    setKind(k);
    setFrom(WINDOW[k][0]);
    setTo(WINDOW[k][1]);
  };

  const run = async (nextSeed = seed) => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line, kind, count, seed: nextSeed, from, to }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "시뮬레이션을 돌리지 못했습니다.");
    setSeed(nextSeed);
    setRes(j);
  };

  const tile = (label: string, value: string, sub = "") => (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-[13px] text-sub">{label}</p>
      <p className="num text-[22px] font-bold">{value}</p>
      {sub && <p className="text-[12px] text-sub">{sub}</p>}
    </div>
  );

  const nameOf = (id: number) => `가상 ${id}번`;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
        <div>
          <h2 className="text-[17px] font-bold">앉아가기 매칭 시뮬레이션</h2>
          <p className="text-[13px] text-sub">가상 회원을 만들어 실제 매칭 규칙(같은 방면, 1~3정거장, 시각 ±10분)을 돌립니다. 실제 회원 데이터는 읽거나 바꾸지 않습니다. 같은 난수 번호면 같은 결과가 나옵니다.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-[14px]">
          <label className="grid gap-1">
            <span className="font-semibold">구분</span>
            <select className={input} value={kind} onChange={(e) => pickKind(e.target.value as "go" | "back")}>
              <option value="go">출근</option>
              <option value="back">퇴근</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">노선</span>
            <select className={input} value={line} onChange={(e) => setLine(e.target.value)}>
              {PILOT.map((id) => <option key={id} value={id} disabled={!LINE_STATIONS[id]}>{lineName(id)}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">가상 회원 수</span>
            <input type="number" min={2} max={300} className={`${input} w-28`} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">시간대 시작</span>
            <input type="time" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">시간대 끝</span>
            <input type="time" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="font-semibold">난수 번호</span>
            <input type="number" className={`${input} w-28`} value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>
          <button type="button" disabled={busy} onClick={() => run(seed)} className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-40">{busy ? "계산 중…" : "실행"}</button>
          <button type="button" disabled={busy} onClick={() => run(seed + 1)} className="rounded-xl border border-line bg-white px-4 py-2.5 font-semibold text-ink disabled:opacity-40">다른 난수로 다시</button>
        </div>
        {msg && <p role="alert" className="text-[14px] text-warn">{msg}</p>}
      </section>

      {res && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tile("가상 회원", `${res.summary.users}명`, `비교한 쌍 ${res.summary.pairsTested.toLocaleString("ko-KR")}개`)}
            {tile("매칭된 쌍", `${res.summary.matches}쌍`, `평균 시각 차 ${res.summary.avgGap}분`)}
            {tile("자리를 받을 수 있는 회원", `${res.summary.takers}명`, `매칭 없는 회원 ${res.summary.unmatched}명`)}
            {tile("정거장 수별", `1정 ${res.summary.byStops[0]} · 2정 ${res.summary.byStops[1]} · 3정 ${res.summary.byStops[2]}`, "1정거장이 1순위")}
          </div>

          <section className="space-y-2 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-[17px] font-bold">가상 회원별 매칭 리스트 <span className="text-[13px] font-normal text-sub">{res.kind === "go" ? "출근" : "퇴근"} 기준</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-sub">
                  <tr>{["회원", "받을 수 있는 상대", "줄 수 있는 상대", "가장 가까운 상대", "정거장", "시각 차"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {res.perUser.map((u) => (
                    <tr key={u.id}>
                      <td className="px-2 py-2">{nameOf(u.id)}</td>
                      <td className="num px-2 py-2">{u.takeCount}명</td>
                      <td className="num px-2 py-2">{u.giveCount}명</td>
                      <td className="px-2 py-2">{u.best ? `${nameOf(u.best.with)} (${u.best.role === "take" ? "받음" : "줌"})` : "없음"}</td>
                      <td className="num px-2 py-2">{u.best ? `${u.best.stops}정거장` : "—"}</td>
                      <td className="num px-2 py-2">{u.best ? `${u.best.gapMin}분` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-[17px] font-bold">매칭 쌍 <span className="text-[13px] font-normal text-sub">받는 사람 ← 주는 사람 · 정거장 순</span></h2>
            {res.matches.length === 0 && <p className="text-[14px] text-sub">매칭된 쌍이 없어요. 시간대를 넓히거나 인원을 늘려 보세요.</p>}
            {res.matches.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-sub">
                    <tr>{["받는 사람", "주는 사람", "정거장", "자리 나는 역", "만날 역", "시각 차", "만날 칸-문"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {res.matches.map((m, i) => (
                      <tr key={`${m.taker}-${m.giver}-${i}`}>
                        <td className="px-2 py-2">{nameOf(m.taker)}</td>
                        <td className="px-2 py-2">{nameOf(m.giver)}</td>
                        <td className="num px-2 py-2">{m.stops}정거장</td>
                        <td className="px-2 py-2">{m.seatStation}</td>
                        <td className="px-2 py-2">{m.meetStation}</td>
                        <td className="num px-2 py-2">{m.gapMin}분</td>
                        <td className="num px-2 py-2">{m.car}-{m.gate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-[17px] font-bold">가상 회원 <span className="text-[13px] font-normal text-sub">탑승역 → 하차역, 방면, 시각</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-sub">
                  <tr>{["회원", "구분", "탑승역", "하차역", "방면(다음 역)", "시각", "요일", "탑승 칸-문"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {res.users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-2 py-2">{nameOf(u.id)}</td>
                      <td className="px-2 py-2">{res.kind === "go" ? "출근" : "퇴근"}</td>
                      <td className="px-2 py-2">{u.board}</td>
                      <td className="px-2 py-2">{u.alight}</td>
                      <td className="px-2 py-2">{u.next}</td>
                      <td className="num px-2 py-2">{u.time}</td>
                      <td className="num px-2 py-2">{u.days}</td>
                      <td className="num px-2 py-2">{u.car}-{u.gate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
