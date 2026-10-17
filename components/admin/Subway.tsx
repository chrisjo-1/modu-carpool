"use client";
import { useEffect, useState } from "react";
import { ALL_LINES, type LineId } from "@/lib/subway";

type Config = { enabled: boolean; pilot: LineId[] };
const PILOT_OK: LineId[] = ["2", "5"];

/** 관리자 > 지하철: 앉아가기 열기 여부와 시범 노선. 전 노선을 보여 주고 2·5호선만 고를 수 있다. */
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
    <section className="grid gap-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <h2 className="text-[18px] font-bold">지하철 관리</h2>
        <p className="mt-1 text-[14px] text-sub">앉아가기 준비 상태와 시범 노선을 정합니다. 시범 노선은 2호선·5호선만 고를 수 있어요.</p>
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
  );
}
