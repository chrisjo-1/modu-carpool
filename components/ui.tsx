"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { dayLabel, translate, type Lang } from "@/lib/i18n";

export const LangContext = createContext<Lang>("ko");
/** 현재 언어의 번역 함수. 한국어 문구를 키로 쓴다. */
export function useT() {
  const lang = useContext(LangContext);
  return (ko: string) => translate(lang, ko);
}
export function useLang() {
  return useContext(LangContext);
}

const LOCALE: Record<Lang, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };
export const when = (ms: number, lang: Lang) =>
  new Date(ms).toLocaleString(LOCALE[lang], { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export { distanceKm } from "@/lib/geo";
export const kmText = (km: number) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)}m` : `${km < 10 ? km.toFixed(1) : Math.round(km)}km`);

export const money = (n: number, lang: Lang) => (lang === "ko" ? `${n.toLocaleString("ko-KR")}원` : `₩${n.toLocaleString("en-US")}`);

/** 정기카풀이면 "평일 07:30 / 18:30", 아니면 출발 일시 */
export function scheduleText(p: { regular?: boolean; days?: string; timeGo?: string; timeBack?: string; departAt: number }, lang: Lang) {
  if (!p.regular) return when(p.departAt, lang);
  return `${dayLabel(lang, p.days ?? "")} ${p.timeGo ?? ""}${p.timeBack ? ` / ${p.timeBack}` : ""}`;
}

/** 프로필 사진. 없으면 닉네임 첫 글자를 보여준다. */
export function Avatar({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" style={style} className="shrink-0 rounded-full border border-line object-cover" />
  ) : (
    <span aria-hidden style={style} className="grid shrink-0 place-items-center rounded-full bg-accentSoft font-semibold text-accent">{[...name][0] ?? "?"}</span>
  );
}

export async function api<T = Record<string, unknown>>(url: string, method = "GET", data?: unknown): Promise<{ ok: boolean; data: T; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, data: d as T, error: res.ok ? "" : String((d as { error?: string }).error ?? "요청을 처리하지 못했습니다.") };
  } catch {
    return { ok: false, data: {} as T, error: "네트워크 연결을 확인해 주세요." };
  }
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
  home: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M4 11l8-7 8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5V11z" /></svg>
  ),
  plus: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
  ),
  image: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8.5 8" /></svg>
  ),
  chat: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4.5 3.5V17H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></svg>
  ),
  user: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
  ),
  car: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M4 14l1.6-4.6A2 2 0 0 1 7.5 8h9a2 2 0 0 1 1.9 1.4L20 14v4H4v-4z" /><path d="M7.5 15.5h.01M16.5 15.5h.01" /></svg>
  ),
  close: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M6 6l12 12M18 6L6 18" /></svg>
  ),
  arrow: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M9 6l6 6-6 6" /></svg>
  ),
  down: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><path d="M12 5v14M7 14l5 5 5-5" /></svg>
  ),
};

export function Sheet({ title, onClose, children, blockId }: { title: string; onClose: () => void; children: ReactNode; blockId: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30" role="dialog" aria-modal="true" aria-label={title}>
      <div data-block-id={blockId} data-block-name={title} className="sheet safe-b flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-[28px] bg-surface shadow-card">
        <div className="flex items-center justify-between px-6 pb-2 pt-4">
          <p className="text-sm font-medium text-sub">{title}</p>
          <button onClick={onClose} aria-label="닫기" className="-mr-2 grid w-11 place-items-center text-sub">{Icon.close()}</button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
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

export function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" | "warn" }) {
  const c = tone === "accent" ? "bg-accentSoft text-accent" : tone === "warn" ? "bg-warnSoft text-warn" : "bg-bg text-sub";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-medium ${c}`}>{children}</span>;
}

/** 여러 선택지 중 하나를 고르는 버튼 줄 */
export function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-bg p-1">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`flex-1 rounded-lg px-2 text-[15px] ${value === v ? "bg-white font-semibold text-ink shadow-sm" : "text-sub"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const btnPrimary = "w-full rounded-2xl bg-accent px-5 py-4 text-[17px] font-semibold text-white active:opacity-90 disabled:opacity-40";
export const btnGhost = "w-full rounded-2xl bg-bg px-5 py-4 text-[17px] font-semibold text-ink active:opacity-80";
export const field = "w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] text-ink outline-none focus:border-accent";
