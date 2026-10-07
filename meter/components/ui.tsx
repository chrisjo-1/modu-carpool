"use client";
import { useEffect, useState, type ReactNode } from "react";

export type Ride = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number;
  total: number;
  passengers: number;
  perPerson: number;
  preset: string;
  synced?: boolean;
};

export type Settings = {
  presetId: string;
  custom: { base: number; baseDist: number; unitDist: number; unitFare: number; unitSec: number };
  passengers: number;
  includeDriver: boolean;
  night: boolean;
  consent: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  presetId: "seoul",
  custom: { base: 4800, baseDist: 1600, unitDist: 131, unitFare: 100, unitSec: 30 },
  passengers: 2,
  includeDriver: false,
  night: true,
  consent: false,
};

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...(fallback as object), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}
export function loadList<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 공간을 쓸 수 없는 환경에서는 메모리로만 동작 */
  }
}

/** 기기에 저장되는 상태. 첫 렌더는 기본값, 마운트 후 저장값으로 교체. */
export function useStored<T>(key: string, fallback: T, list = false) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setValue(list ? (loadList(key) as T) : load(key, fallback));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (ready) save(key, value);
  }, [key, value, ready]);
  return [value, setValue, ready] as const;
}

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const Icon = {
  meter: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M4 16a8 8 0 1 1 16 0" /><path d="M12 16l4-5" /><path d="M4 19h16" /></svg>
  ),
  list: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 3v2M15 3v2M9 10h6M9 14h6M9 18h3" /></svg>
  ),
  gear: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></svg>
  ),
  pin: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
  ),
  alert: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M12 4l9 15.5H3L12 4z" /><path d="M12 10v4.5M12 17.2v.3" /></svg>
  ),
  close: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  arrow: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M9 6l6 6-6 6" /></svg>
  ),
};

export function Sheet({
  title,
  onClose,
  children,
  blockId,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  blockId: string;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30" role="dialog" aria-modal="true" aria-label={title}>
      <div
        data-block-id={blockId}
        data-block-name={title}
        className="sheet safe-b max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface px-6 pb-6 pt-5 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-sub">{title}</p>
          {onClose && (
            <button onClick={onClose} aria-label="닫기" className="-mr-2 grid w-11 place-items-center text-sub">
              {Icon.close()}
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <div {...rest} className={`rounded-3xl border border-line bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

export const btnPrimary =
  "w-full rounded-2xl bg-accent px-5 py-4 text-[17px] font-semibold text-white active:opacity-90 disabled:opacity-40";
export const btnGhost =
  "w-full rounded-2xl bg-bg px-5 py-4 text-[17px] font-semibold text-ink active:opacity-80";
