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
/** 출발 시각 표기. 등록 시각과 헷갈리지 않도록 뒤에 '출발'을 붙인다. */
export function scheduleText(p: { regular?: boolean; days?: string; timeGo?: string; timeBack?: string; departAt: number }, lang: Lang) {
  const dep = translate(lang, "출발");
  if (!p.regular) return `${when(p.departAt, lang)} ${dep}`;
  return `${dayLabel(lang, p.days ?? "")} ${p.timeGo ?? ""} ${dep}${p.timeBack ? ` / ${p.timeBack} ${dep}` : ""}`;
}

const PLACEHOLDER_BG = ["#DCE8FF", "#D9F5EA", "#FFF1D6", "#F3E1FF", "#FFE1E1", "#E0F4FF"];

/** 사진을 등록하지 않은 회원에게 보여 줄 임의의 기본 이미지(이름마다 고정된 색의 실루엣). */
function placeholderSrc(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = PLACEHOLDER_BG[h % PLACEHOLDER_BG.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><circle cx="50" cy="40" r="18" fill="#ffffff" opacity="0.9"/><ellipse cx="50" cy="92" rx="32" ry="24" fill="#ffffff" opacity="0.9"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 프로필 사진. 운전자는 네모(둥근 사각형), 탑승자는 동그라미로 보여 구분한다.
 * 사진이 없으면 임의의 기본 이미지를 쓴다.
 */
export function Avatar({ src, name, size = 40, role }: { src?: string; name: string; size?: number; role?: string }) {
  const style = { width: size, height: size };
  const shape = role === "driver" ? "rounded-2xl" : "rounded-full";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src || placeholderSrc(name)} alt="" loading="lazy" style={style} className={`shrink-0 border border-line object-cover ${shape}`} />
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

/**
 * 현재 위치를 받는다. 권한이 없거나 실패하면 null.
 * 위치가 필요한 동작(CALL, 운전자 글 올리기)을 할 때만 부른다.
 */
export function currentHere() {
  return new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
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

export function Sheet({ title, onClose, children, blockId, locked = false }: { title: string; onClose: () => void; children: ReactNode; blockId: string; locked?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-ink/30" role="dialog" aria-modal="true" aria-label={title}>
      <div data-block-id={blockId} data-block-name={title} className="sheet safe-b flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-[28px] bg-surface shadow-card">
        <div className="flex items-center justify-between px-6 pb-2 pt-4">
          <p className="text-sm font-medium text-sub">{title}</p>
          {!locked && <button onClick={onClose} aria-label="닫기" className="-mr-2 grid w-11 place-items-center text-sub">{Icon.close()}</button>}
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

export function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" | "warn" | "mint" }) {
  const c = tone === "accent" ? "bg-accentSoft text-accent" : tone === "warn" ? "bg-warnSoft text-warn" : tone === "mint" ? "bg-[#E7F7EE] text-[#1B7A4B]" : "bg-bg text-sub";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-medium ${c}`}>{children}</span>;
}

/** 운전자(파란색)·탑승자(초록색) 표시. 프로필 사진 자리에 쓴다. */
export function RoleTag({ role }: { role?: string }) {
  const t = useT();
  return <Tag tone={role === "driver" ? "accent" : "mint"}>{t(role === "driver" ? "운전자" : "탑승자")}</Tag>;
}

/** 여러 선택지 중 하나를 고르는 버튼 줄 */
/** accents: 고른 항목을 진하게 강조할 색. accent = 파랑, mint = 초록 (운전자·탑승자 구분용) */
export function Segment<T extends string>({ value, options, onChange, label, compact, accents }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; compact?: boolean; accents?: Partial<Record<T, "accent" | "mint">> }) {
  const onStyle = (v: T) => {
    const a = accents?.[v];
    if (a === "accent") return "bg-accent font-bold text-white shadow-card";
    if (a === "mint") return "bg-[#1B7A4B] font-bold text-white shadow-card";
    return "bg-white font-semibold text-ink shadow-sm";
  };
  return (
    <div role="radiogroup" aria-label={label} className={`flex gap-1 rounded-xl bg-bg ${compact ? "p-0.5" : "p-1"}`}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`flex-1 rounded-lg px-2 motion-safe:transition-all motion-safe:duration-200 ${compact ? "py-1.5 text-[14px]" : "py-2 text-[15px]"} ${value === v ? onStyle(v) : "text-sub"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const btnPrimary = "w-full rounded-2xl bg-accent px-5 py-4 text-[17px] font-semibold text-white active:opacity-90 disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97]";
export const btnGhost = "w-full rounded-2xl bg-bg px-5 py-4 text-[17px] font-semibold text-ink active:opacity-80 motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97]";
export const field = "w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] text-ink outline-none focus:border-accent";
