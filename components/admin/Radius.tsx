"use client";
import { useEffect, useState } from "react";

type Values = { taxi: number; route: number; call: number };
type Data = { choices: number[]; values: Values };
const ROWS: [keyof Omit<Values, "call">, string, string][] = [
  ["taxi", "택시 동승 푸시 반경", "카풀 글에서 '택시 동승도 찾기'를 체크하면 출발지 반경 안 운전자·탑승자에게 알려요."],
  ["route", "카풀 운전자(경로 알림) 반경", "내 경로 알림과 출발·도착지가 이 반경 안인 새 카풀 글을 알려요."],
];

const input = "w-28 rounded-xl border border-line bg-white px-3 py-2 text-[15px] text-ink outline-none focus:border-accent";

/** 관리자 > 반경: CALL 반경(직접 입력)과 푸시 반경(2·5·10km 중 선택)을 정한다. */
export default function AdminRadius() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [callKm, setCallKm] = useState("");

  useEffect(() => {
    fetch("/api/admin/radius")
      .then((r) => r.json())
      .then((j) => {
        if (!j.values) return;
        setD(j);
        setCallKm(String(j.values.call));
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  }, []);
  if (!d) return <p className="text-sub">{msg || "불러오는 중…"}</p>;

  const save = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    const r = await fetch("/api/admin/radius", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setD({ ...d, values: j.values });
    setCallKm(String(j.values.call));
    setMsg(done);
  };

  const saveCall = (e: React.FormEvent) => {
    e.preventDefault();
    void save({ call: Number(callKm) }, `CALL 반경을 ${Number(callKm)}km로 저장했습니다. 다음 호출부터 바로 적용됩니다.`);
  };

  return (
    <section data-block-id="A203" data-block-name="반경 설정" className="space-y-6 rounded-2xl bg-white p-5 shadow-card">
      <form onSubmit={saveCall} className="space-y-2" data-block-id="S114" data-block-name="CALL 호출 반경">
        <p className="text-[15px] font-semibold text-ink">CALL 호출 반경 (km)</p>
        <p className="text-[13px] text-sub">호출한 회원의 현재 위치에서 이 거리 안에 최근 30분 안으로 위치를 기록한 운전자에게 알려요. 0.5 ~ 20km, 0.5km 단위.</p>
        <div className="flex items-center gap-2">
          <input data-block-id="F216" className={input} type="number" step="0.5" min="0.5" max="20" value={callKm} onChange={(e) => setCallKm(e.target.value)} aria-label="CALL 호출 반경 km" />
          <button data-block-id="B222" data-block-name="호출 반경 저장" disabled={busy} className="min-h-0 rounded-xl bg-accent px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-50">저장</button>
        </div>
      </form>
      {ROWS.map(([key, label, hint]) => (
        <div key={key} className="space-y-2">
          <p className="text-[15px] font-semibold text-ink">{label}</p>
          <p className="text-[13px] text-sub">{hint}</p>
          <div role="radiogroup" aria-label={label} className="flex gap-2">
            {d.choices.map((km) => (
              <button key={km} type="button" role="radio" aria-checked={d.values[key] === km} disabled={busy}
                data-block-id="B213" data-block-name={`반경 ${km}km`}
                onClick={() => save({ [key]: km }, "저장했습니다. 다음 글부터 바로 적용됩니다.")}
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
