"use client";
import { useEffect, useState } from "react";
import { ALL_LINES, OPENABLE_LINES, lineColor, type LineId } from "@/lib/subway";

type Config = { enabled: boolean; pilot: LineId[] };
const PILOT_OK: LineId[] = OPENABLE_LINES;

/** 관리자 > 지하철: 앉아가기 열기 여부와 시범 노선. 전 노선을 보여 주고 열 수 있는 노선만 고를 수 있다. */
export default function AdminSubway() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/subway")
      .then((r) => r.json())
      .then((j) => (j.config ? setCfg(j.config) : setMsg(j.error ?? "불러오지 못했습니다.")))
      .catch(() => setMsg("불러오지 못했습니다."));
  }, []);

  if (!cfg) return <p className="text-sub">{msg || "불러오는 중…"}</p>;

  const togglePilot = (id: LineId) =>
    setCfg({ ...cfg, pilot: cfg.pilot.includes(id) ? cfg.pilot.filter((x) => x !== id) : [...cfg.pilot, id] });

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/subway", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setCfg(j.config);
    setMsg("저장했어요.");
  };

  return (
    <div className="grid gap-4">
    <section className="grid gap-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <h2 className="text-[18px] font-bold">지하철 관리</h2>
        <p className="mt-1 text-[14px] text-sub">앉아가기 준비 상태와 시범 노선을 정합니다. 열 수 있는 노선은 2·5·6·7·9호선이에요.</p>
      </div>

      <label className="flex min-h-[44px] items-center gap-3 text-[15px] font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-[#7C3AED]" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
        앉아가기 열기 (끄면 사용자 화면에 준비 중으로 보여요)
      </label>

      <div className="grid gap-2">
        <p className="text-sm font-semibold text-ink">노선 선택</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ALL_LINES.map((l) => {
            const ok = PILOT_OK.includes(l.id);
            const on = cfg.pilot.includes(l.id);
            return (
              <label key={l.id} className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-[14px] ${ok ? "border-line bg-white" : "border-line bg-bg text-sub opacity-60"}`}>
                <input type="checkbox" className="h-4 w-4 accent-[#7C3AED]" disabled={!ok} checked={on} onChange={() => togglePilot(l.id)} />
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: lineColor(l.id).bg }} />
                {l.name}
                {!ok && <span className="ml-auto text-[12px]">준비 중</span>}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-violet px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-50">
          {busy ? "저장 중…" : "저장"}
        </button>
        {msg && <span role="status" className="text-[14px] text-sub">{msg}</span>}
      </div>
    </section>
    <SubwayRegistrations />
    </div>
  );
}

type Reg = { id: number; name: string; email: string; test: boolean; boardLine: string; board: string; alightLine: string; alight: string; back: boolean; createdAt: string; updatedAt: string };

const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
const lineName = (id: string) => ALL_LINES.find((l) => l.id === id)?.name ?? id;

/** 지하철 등록 현황: 노선별 인원(노선색 칩, 누르면 그 노선만)과 활성 등록자 목록. */
function SubwayRegistrations() {
  const [data, setData] = useState<{ total: number; byLine: Record<string, number>; plans: Reg[] } | null>(null);
  const [err, setErr] = useState("");
  const [line, setLine] = useState("");

  useEffect(() => {
    fetch("/api/admin/subway/plans")
      .then((r) => r.json())
      .then((j) => (j.plans ? setData(j) : setErr(j.error ?? "불러오지 못했습니다.")))
      .catch(() => setErr("불러오지 못했습니다."));
  }, []);

  const lines = data ? Object.entries(data.byLine).sort((a, b) => b[1] - a[1]) : [];
  const shown = data ? data.plans.filter((p) => !line || p.boardLine === line || p.alightLine === line) : [];

  return (
    <section className="grid gap-4 rounded-2xl bg-white p-5 shadow-card" data-block-id="S099" data-block-name="지하철 등록 현황">
      <div>
        <h2 className="text-[18px] font-bold">지하철 등록 현황</h2>
        <p className="mt-1 text-[14px] text-sub">지금 활성인 지하철 등록(해제한 등록 제외)입니다. 노선을 누르면 그 노선 등록자만 봅니다.</p>
      </div>
      {err && <p className="text-[14px] text-warn">{err}</p>}
      {!data && !err && <p className="text-[14px] text-sub">불러오는 중…</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLine("")} className={`min-h-[36px] rounded-full border-2 px-3 text-[14px] font-semibold ${line === "" ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}>
              전체 {data.total}명
            </button>
            {lines.map(([id, n]) => {
              const c = lineColor(id);
              const on = line === id;
              return (
                <button key={id} type="button" onClick={() => setLine(on ? "" : id)} className="min-h-[36px] rounded-full border-2 px-3 text-[14px] font-semibold" style={on ? { background: c.bg, borderColor: c.bg, color: c.text } : { background: "#FFFFFF", borderColor: c.bg, color: "#1F2937" }}>
                  {lineName(id)} {n}명
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-xl bg-bg px-4 py-3 text-[14px] text-sub">등록자가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-sub">
                  <tr>{["닉네임", "이메일", "노선", "승차 → 하차", "반대 방면", "등록일", "수정일"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-2 py-2">{p.name || "-"}{p.test && <span className="ml-1 rounded bg-bg px-1 text-[11px] text-sub">테스트</span>}</td>
                      <td className="px-2 py-2 text-sub">{p.email || "-"}</td>
                      <td className="px-2 py-2">
                        <span className="rounded-md px-1.5 py-0.5 text-[12px] font-bold" style={{ background: lineColor(p.boardLine).bg, color: lineColor(p.boardLine).text }}>{lineName(p.boardLine)}</span>
                        {p.alightLine !== p.boardLine && <span className="ml-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold" style={{ background: lineColor(p.alightLine).bg, color: lineColor(p.alightLine).text }}>{lineName(p.alightLine)}</span>}
                      </td>
                      <td className="px-2 py-2">{p.board} → {p.alight}</td>
                      <td className="px-2 py-2">{p.back ? "등록" : "-"}</td>
                      <td className="num px-2 py-2 text-sub">{kstDay(p.createdAt)}</td>
                      <td className="num px-2 py-2 text-sub">{kstDay(p.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
