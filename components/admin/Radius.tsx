"use client";
import { useEffect, useState } from "react";

type Data = { choices: number[]; values: { taxi: number; route: number } };
const ROWS: [keyof Data["values"], string, string][] = [
  ["taxi", "택시 동승 글 푸시 반경", "택시 동승 글을 올리면 출발지 반경 안 회원에게 알려요."],
  ["route", "카풀 운전자(경로 알림) 반경", "내 경로 알림과 출발·도착지가 이 반경 안인 새 카풀 글을 알려요."],
];

/** 관리자 > 반경: 푸시를 보낼 거리(2·5·10km)를 고른다. */
export default function AdminRadius() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/radius").then((r) => r.json()).then((j) => j.values && setD(j)).catch(() => setMsg("불러오지 못했습니다."));
  }, []);
  if (!d) return <p className="text-sub">{msg || "불러오는 중…"}</p>;

  const set = async (key: keyof Data["values"], km: number) => {
    setBusy(true);
    const r = await fetch("/api/admin/radius", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: km }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setD({ ...d, values: j.values });
    setMsg("저장했습니다. 다음 글부터 바로 적용됩니다.");
  };

  return (
    <section data-block-id="A203" data-block-name="반경 설정" className="space-y-4 rounded-2xl bg-white p-5 shadow-card">
      {ROWS.map(([key, label, hint]) => (
        <div key={key} className="space-y-2">
          <p className="text-[15px] font-semibold text-ink">{label}</p>
          <p className="text-[13px] text-sub">{hint}</p>
          <div role="radiogroup" aria-label={label} className="flex gap-2">
            {d.choices.map((km) => (
              <button key={km} type="button" role="radio" aria-checked={d.values[key] === km} disabled={busy}
                data-block-id="B213" data-block-name={`반경 ${km}km`}
                onClick={() => set(key, km)}
                className={`min-h-0 rounded-xl px-4 py-2 text-[15px] ${d.values[key] === km ? "bg-accent font-semibold text-white" : "bg-bg text-sub"}`}>
                {km}km
              </button>
            ))}
          </div>
        </div>
      ))}
      {msg && <p role="status" className="text-[14px] text-sub">{msg}</p>}
    </section>
  );
}
