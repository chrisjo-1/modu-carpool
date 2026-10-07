"use client";
import { useState } from "react";
import type { AppConfig } from "@/lib/config";
import { won } from "@/lib/fare";
import { Card, Icon, btnGhost, btnPrimary, type Settings } from "./ui";

const field = "w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] outline-none focus:border-accent";

function Toggle({ label, desc, on, onChange, id }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button data-block-id={id} data-block-name={label} role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-sub">{desc}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export default function SettingsTab({
  config,
  settings,
  setSettings,
  user,
  authEnabled,
  onAuth,
  onLogout,
}: {
  config: AppConfig;
  settings: Settings;
  setSettings: (fn: (s: Settings) => Settings) => void;
  user: { email: string } | null;
  authEnabled: boolean;
  onAuth: (action: "login" | "signup", email: string, password: string) => Promise<string | null>;
  onLogout: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const c = settings.custom;
  const setCustom = (k: keyof Settings["custom"], v: string) =>
    setSettings((s) => ({ ...s, custom: { ...s.custom, [k]: Math.max(0, Math.round(Number(v) || 0)) } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const err = await onAuth(mode, email, password);
    setBusy(false);
    if (err) setMsg(err);
    else setPassword("");
  };

  return (
    <section data-block-id="S003" data-block-name="설정" className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">설정</h1>
        <p className="mt-1 text-sub">변경 즉시 자동 저장됩니다.</p>
      </header>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">지역 · 차종</h2>
        <Card className="divide-y divide-line" role="radiogroup" aria-label="지역과 차종">
          {[...config.presets.map((p) => ({ id: p.id, name: p.name, desc: `기본 ${won(p.base)}원 / ${won(p.baseDist)}m` })), { id: "custom", name: "직접 입력", desc: "내가 원하는 요율로 설정" }].map((p) => {
            const on = settings.presetId === p.id;
            return (
              <button key={p.id} role="radio" aria-checked={on} onClick={() => setSettings((s) => ({ ...s, presetId: p.id }))} className="flex w-full items-center justify-between px-5 py-4 text-left">
                <span>
                  <span className={`block text-[17px] ${on ? "font-bold" : "font-semibold"}`}>{p.name}</span>
                  <span className="num block text-sm text-sub">{p.desc}</span>
                </span>
                <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${on ? "border-accent" : "border-line"}`}>
                  {on && <span className="h-3 w-3 rounded-full bg-accent" />}
                </span>
              </button>
            );
          })}
        </Card>
        {settings.presetId === "custom" && (
          <Card data-block-id="C020" data-block-name="직접 입력 요율" className="mt-3 grid grid-cols-2 gap-3 p-5">
            {([
              ["base", "기본요금(원)"],
              ["baseDist", "기본거리(m)"],
              ["unitFare", "추가요금(원)"],
              ["unitDist", "추가 거리 단위(m)"],
              ["unitSec", "저속 시 시간 단위(초)"],
            ] as const).map(([k, label]) => (
              <label key={k} className="text-sm text-sub">
                {label}
                <input data-block-id={`F-${k}`} className={`${field} num mt-1 text-ink`} inputMode="numeric" value={c[k]} onChange={(e) => setCustom(k, e.target.value)} />
              </label>
            ))}
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">동승자 수 (운전자 제외)</h2>
        <Card data-block-id="C021" data-block-name="동승자 수" className="px-5 py-5 text-center">
          <div className="flex items-center justify-center gap-6">
            <button aria-label="줄이기" className="grid h-12 w-12 place-items-center rounded-full bg-bg text-2xl" onClick={() => setSettings((s) => ({ ...s, passengers: Math.max(1, s.passengers - 1) }))}>−</button>
            <p className="num w-16 text-4xl font-bold">{settings.passengers}<span className="text-base font-medium">명</span></p>
            <button aria-label="늘리기" className="grid h-12 w-12 place-items-center rounded-full bg-bg text-2xl" onClick={() => setSettings((s) => ({ ...s, passengers: Math.min(6, s.passengers + 1) }))}>+</button>
          </div>
          <p className="mt-3 text-sm text-sub">총액을 인원수로 나눠 1인 부담을 계산합니다.</p>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">옵션</h2>
        <Card className="divide-y divide-line">
          <Toggle id="B030" label="운전자도 함께 나누기" desc="동승자 수 + 운전자 1명으로 나눕니다." on={settings.includeDriver} onChange={(v) => setSettings((s) => ({ ...s, includeDriver: v }))} />
          <Toggle id="B031" label="심야 할증 반영" desc="지역별 심야 시간대 할증률을 적용합니다." on={settings.night} onChange={(v) => setSettings((s) => ({ ...s, night: v }))} />
        </Card>
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">계정</h2>
        <Card data-block-id="C022" data-block-name="계정" className="p-5">
          {user ? (
            <div className="space-y-3">
              <p className="text-sm text-sub">로그인됨</p>
              <p className="break-all text-lg font-semibold">{user.email}</p>
              <p className="text-sm text-sub">운행 기록이 계정에 저장되어 다른 기기에서도 볼 수 있습니다.</p>
              <button data-block-id="B032" data-block-name="로그아웃" className={btnGhost} onClick={onLogout}>로그아웃</button>
            </div>
          ) : !authEnabled ? (
            <p className="text-[15px] leading-relaxed text-sub">로그인 기능은 준비 중입니다. 지금은 운행 기록이 이 기기에만 저장됩니다.</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-bg p-1">
                {(["login", "signup"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setMsg(""); }} className={`rounded-lg text-[15px] ${mode === m ? "bg-white font-semibold shadow-sm" : "text-sub"}`}>
                    {m === "login" ? "로그인" : "회원가입"}
                  </button>
                ))}
              </div>
              <label className="block text-sm text-sub">
                이메일
                <input data-block-id="F001" className={`${field} mt-1 text-ink`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="block text-sm text-sub">
                비밀번호 (8자 이상)
                <input data-block-id="F002" className={`${field} mt-1 text-ink`} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
              <button data-block-id="B033" data-block-name="로그인 제출" className={btnPrimary} disabled={busy}>
                {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 시작"}
              </button>
            </form>
          )}
        </Card>
      </div>

      <Card data-block-id="C023" data-block-name="모두의카풀" className="p-5">
        <p className="text-sm font-medium text-accent">모두의카풀</p>
        <p className="mt-1 text-lg font-semibold">같은 방향 카풀 메이트 찾기</p>
        <p className="mt-1 text-[15px] text-sub">모카 미터기는 모두의카풀이 만든 비용 나눔 도구입니다.</p>
        {config.carpoolUrl ? (
          <a data-block-id="B034" data-block-name="모두의카풀 이동" href={config.carpoolUrl} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-between rounded-2xl bg-accentSoft px-4 font-semibold text-accent">
            모두의카풀 열기 {Icon.arrow()}
          </a>
        ) : (
          <p className="mt-4 rounded-2xl bg-bg px-4 py-3 text-[15px] text-sub">곧 연결됩니다.</p>
        )}
      </Card>

      <p className="px-1 text-[13px] leading-relaxed text-sub">
        표시 금액은 공개된 택시 요율을 참고한 추정치이며 실제 택시 요금과 다를 수 있습니다. 위치 정보는 기기 안에서 거리 계산에만 쓰이고 서버로 전송되지 않습니다.
      </p>
    </section>
  );
}
