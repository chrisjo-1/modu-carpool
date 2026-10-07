"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONFIG, sanitizeConfig, type AppConfig, type Preset } from "@/lib/config";
import Meter from "./Meter";
import Records from "./Records";
import SettingsTab from "./SettingsTab";
import { DEFAULT_SETTINGS, Icon, useStored, type Ride, type Settings } from "./ui";

type Tab = "meter" | "records" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("meter");
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [settings, setSettings, ready] = useStored<Settings>("moca.settings", DEFAULT_SETTINGS);
  const [rides, setRides, ridesReady] = useStored<Ride[]>("moca.rides", [], true);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const ridesRef = useRef(rides);
  ridesRef.current = rides;

  const sync = useCallback(async () => {
    try {
      const pending = ridesRef.current.filter((r) => !r.synced);
      if (pending.length)
        await fetch("/api/rides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rides: pending }) });
      const res = await fetch("/api/rides");
      if (!res.ok) return;
      const server = ((await res.json()).rides as Ride[]).map((r) => ({ ...r, synced: true }));
      const ids = new Set(server.map((r) => r.id));
      const localOnly = ridesRef.current.filter((r) => !ids.has(r.id) && !r.synced);
      setRides([...server, ...localOnly].sort((a, b) => b.startedAt - a.startedAt));
    } catch {
      /* 오프라인이면 다음에 다시 시도 */
    }
  }, [setRides]);

  useEffect(() => {
    fetch("/api/config").then((r) => (r.ok ? r.json() : null)).then((c) => c && setConfig(sanitizeConfig(c))).catch(() => {});
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!ridesReady) return;
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setAuthEnabled(!!d.enabled);
        setUser(d.user ?? null);
        if (d.user) sync();
      })
      .catch(() => {});
  }, [ridesReady, sync]);

  const preset: Preset = useMemo(() => {
    if (settings.presetId === "custom") {
      const c = settings.custom;
      return { id: "custom", name: "직접 입력", base: c.base, baseDist: c.baseDist, unitDist: Math.max(10, c.unitDist), unitFare: c.unitFare, unitSec: Math.max(5, c.unitSec), slowKmh: 15, night: [] };
    }
    return config.presets.find((p) => p.id === settings.presetId) ?? config.presets[0];
  }, [settings.presetId, settings.custom, config.presets]);

  const onSave = (r: Ride) => {
    const next = [r, ...ridesRef.current.filter((x) => x.id !== r.id)];
    ridesRef.current = next;
    setRides(next);
    if (user) sync();
  };

  const onDelete = (id: string) => {
    setRides(ridesRef.current.filter((r) => r.id !== id));
    if (user) fetch(`/api/rides?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  };

  const onAuth = async (action: "login" | "signup", email: string, password: string) => {
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, password }) });
      const d = await res.json();
      if (!res.ok) return (d.error as string) ?? "실패했습니다.";
      setUser(d.user);
      sync();
      return null;
    } catch {
      return "네트워크 연결을 확인해 주세요.";
    }
  };

  const onLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    setUser(null);
  };

  const tabs: { id: Tab; label: string; icon: (w?: number) => React.ReactNode; block: string }[] = [
    { id: "meter", label: "미터기", icon: Icon.meter, block: "N001" },
    { id: "records", label: "기록", icon: Icon.list, block: "N002" },
    { id: "settings", label: "설정", icon: Icon.gear, block: "N003" },
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center gap-3 px-5 pb-2 pt-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white">{Icon.meter(1.8)}</span>
        <div>
          <p className="text-xl font-bold leading-tight">모카 미터기</p>
          <p className="text-[13px] leading-tight text-sub">모두의카풀 비용 나눔</p>
        </div>
        {config.carpoolUrl && (
          <a data-block-id="B040" data-block-name="모두의카풀 이동" href={config.carpoolUrl} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-0.5 rounded-full border border-line bg-white py-0 pl-3.5 pr-2 text-[14px] font-semibold text-accent">
            모두의카풀 {Icon.arrow()}
          </a>
        )}
      </header>

      <main className="flex-1 px-4 pb-28 pt-2">
        {!ready ? (
          <div className="h-72 animate-pulse rounded-3xl bg-white" aria-hidden />
        ) : (
          <>
            <div hidden={tab !== "meter"}>
              <Meter preset={preset} settings={settings} setSettings={setSettings} notice={config.notice} onSave={onSave} goSettings={() => setTab("settings")} />
            </div>
            {tab === "records" && <Records rides={rides} cap={config.monthlyCap} loggedIn={!!user} onDelete={onDelete} goSettings={() => setTab("settings")} />}
            {tab === "settings" && <SettingsTab config={config} settings={settings} setSettings={setSettings} user={user} authEnabled={authEnabled} onAuth={onAuth} onLogout={onLogout} />}
          </>
        )}
      </main>

      <nav aria-label="하단 메뉴" className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <li key={t.id}>
                <button data-block-id={t.block} data-block-name={t.label} aria-current={on ? "page" : undefined} onClick={() => setTab(t.id)} className={`flex w-full flex-col items-center gap-0.5 py-2.5 text-xs ${on ? "font-semibold text-accent" : "text-sub"}`}>
                  {t.icon(on ? 1.9 : 1.5)}
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
