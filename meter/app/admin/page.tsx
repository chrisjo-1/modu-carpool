"use client";
import { useEffect, useState } from "react";
import { DEFAULT_CONFIG, sanitizeConfig, type AppConfig, type Preset } from "@/lib/config";

const input = "w-full rounded-lg border border-line bg-white px-2 py-2 text-[15px] outline-none focus:border-accent";
const cols: [keyof Preset, string][] = [
  ["name", "이름"], ["base", "기본요금"], ["baseDist", "기본거리(m)"], ["unitFare", "추가요금"],
  ["unitDist", "거리단위(m)"], ["unitSec", "시간단위(초)"], ["slowKmh", "저속기준(km/h)"],
];

export default function Admin() {
  const [state, setState] = useState<"loading" | "gate" | "in">("loading");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<{ db: boolean; stats: { users: number; rides: number; total: number } | null } | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  const refresh = async () => {
    const a = await fetch("/api/admin").then((r) => r.json()).catch(() => ({ admin: false }));
    if (!a.admin) return setState("gate");
    setInfo({ db: !!a.db, stats: a.stats ?? null });
    const c = await fetch("/api/config").then((r) => r.json()).catch(() => null);
    if (c) setConfig(sanitizeConfig(c));
    setState("in");
  };
  useEffect(() => {
    refresh();
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!res.ok) return setMsg((await res.json()).error ?? "실패");
    setPassword("");
    refresh();
  };

  const saveConfig = async () => {
    setMsg("");
    const res = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    const d = await res.json();
    if (!res.ok) return setMsg(d.error ?? "저장 실패");
    setConfig(sanitizeConfig(d));
    setMsg("저장했습니다.");
  };

  const setPreset = (i: number, k: keyof Preset, v: string) =>
    setConfig((c) => ({ ...c, presets: c.presets.map((p, j) => (j === i ? { ...p, [k]: k === "name" ? v : Number(v) || 0 } : p)) }));

  if (state === "loading") return <main className="p-8 text-sub">불러오는 중…</main>;

  if (state === "gate")
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="text-2xl font-bold">모카 미터기 관리자</h1>
        <form onSubmit={login} className="mt-6 space-y-3" data-block-id="S090" data-block-name="관리자 로그인">
          <label className="block text-sm text-sub">
            관리자 비밀번호
            <input className={`${input} mt-1 py-3`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
          <button className="w-full rounded-xl bg-accent py-3 font-semibold text-white">들어가기</button>
        </form>
      </main>
    );

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">모카 미터기 관리자</h1>
        <button className="rounded-xl bg-white px-4 text-sm text-sub shadow-card" onClick={async () => { await fetch("/api/admin", { method: "DELETE" }); setState("gate"); }}>나가기</button>
      </div>

      <section data-block-id="S091" data-block-name="현황" className="grid grid-cols-3 gap-3">
        {[
          ["가입 회원", info?.stats ? `${info.stats.users.toLocaleString()}명` : "—"],
          ["저장된 운행", info?.stats ? `${info.stats.rides.toLocaleString()}건` : "—"],
          ["운행 총액", info?.stats ? `${info.stats.total.toLocaleString()}원` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="text-sm text-sub">{k}</p>
            <p className="num mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </section>
      {!info?.db && <p className="rounded-xl bg-warnSoft px-4 py-3 text-sm text-warn">DB가 아직 연결되지 않았습니다. 연결 전에는 현황 조회와 설정 저장이 되지 않습니다.</p>}

      <section data-block-id="S092" data-block-name="요율표" className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold">지역별 요율</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-sub">
              <tr>{cols.map(([, l]) => <th key={l} className="px-1 py-2 font-medium">{l}</th>)}</tr>
            </thead>
            <tbody>
              {config.presets.map((p, i) => (
                <tr key={p.id}>
                  {cols.map(([k]) => (
                    <td key={k} className="px-1 py-1">
                      <input aria-label={`${p.name} ${k}`} className={`${input} num`} value={String(p[k])} onChange={(e) => setPreset(i, k, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-sub">심야 할증 시간대는 기본값을 유지합니다.</p>
      </section>

      <section data-block-id="S093" data-block-name="문구·링크" className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold">문구 · 링크</h2>
        <label className="block text-sm text-sub">
          [C003] 미터기 화면 법적 고지 문구
          <textarea className={`${input} mt-1`} rows={2} maxLength={200} value={config.notice} onChange={(e) => setConfig({ ...config, notice: e.target.value })} />
        </label>
        <label className="block text-sm text-sub">
          [B034] 모두의카풀 링크 (https://로 시작)
          <input className={`${input} mt-1`} value={config.carpoolUrl} placeholder="https://" onChange={(e) => setConfig({ ...config, carpoolUrl: e.target.value })} />
        </label>
        <label className="block text-sm text-sub">
          [C010] 월 권장 상한(원)
          <input className={`${input} num mt-1`} inputMode="numeric" value={config.monthlyCap} onChange={(e) => setConfig({ ...config, monthlyCap: Number(e.target.value) || 0 })} />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button data-block-id="B090" data-block-name="설정 저장" className="rounded-xl bg-accent px-6 py-3 font-semibold text-white" onClick={saveConfig}>저장</button>
        <button className="rounded-xl bg-white px-5 text-sm text-sub shadow-card" onClick={() => setConfig(DEFAULT_CONFIG)}>기본값 불러오기</button>
        {msg && <p role="status" className="text-sm text-sub">{msg}</p>}
      </div>
    </main>
  );
}
