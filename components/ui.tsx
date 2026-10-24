"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
  const zoom = usePhotoZoom() && !!src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || placeholderSrc(name)}
      alt=""
      loading="lazy"
      style={style}
      className={`shrink-0 border border-line object-cover ${shape} ${zoom ? "cursor-zoom-in" : ""}`}
      onClick={
        zoom
          ? (e) => {
              // 관리자 메일 회원만: 감싼 버튼(프로필 열기 등)은 실행하지 않고 사진만 크게 연다.
              e.preventDefault();
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("modu:photo-zoom", { detail: { src, name } }));
            }
          : undefined
      }
    />
  );
}

/* 관리자 메일 회원(서버가 user.photoZoom으로 알려 줌)은 모든 화면의 프로필 사진을 눌러 전체화면으로 본다. */
let photoZoomAllowed = false;
const photoZoomSubs = new Set<() => void>();
export function setPhotoZoom(v: boolean) {
  if (photoZoomAllowed === v) return;
  photoZoomAllowed = v;
  photoZoomSubs.forEach((f) => f());
}
function usePhotoZoom() {
  return useSyncExternalStore(
    (f) => {
      photoZoomSubs.add(f);
      return () => photoZoomSubs.delete(f);
    },
    () => photoZoomAllowed,
    () => false,
  );
}

/** 프로필 사진 전체화면 보기. App에 한 번만 둔다. 밝은 바탕, 아무 곳이나 누르면 닫힌다. */
export function PhotoZoomLayer() {
  const [shot, setShot] = useState<{ src: string; name: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setShot((e as CustomEvent<{ src: string; name: string }>).detail);
    window.addEventListener("modu:photo-zoom", on);
    return () => window.removeEventListener("modu:photo-zoom", on);
  }, []);
  useEffect(() => {
    if (!shot) return;
    lockBody();
    const key = (e: KeyboardEvent) => e.key === "Escape" && setShot(null);
    window.addEventListener("keydown", key);
    return () => {
      unlockBody();
      window.removeEventListener("keydown", key);
    };
  }, [shot]);
  if (!shot) return null;
  return (
    <div
      data-block-id="C130"
      data-block-name="프로필 사진 전체화면"
      role="dialog"
      aria-modal="true"
      aria-label={`${shot.name} 프로필 사진`}
      className="fade-in fixed inset-0 z-[70] flex flex-col bg-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      onClick={() => setShot(null)}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{shot.name}</span>
        <button aria-label="닫기" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink" onClick={() => setShot(null)}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.src} alt="" className="min-h-0 w-full flex-1 object-contain" />
    </div>
  );
}

/** 운전자 등급 배지(브론즈·실버·골드). 얇은 선 메달 아이콘 + 등급 이름. 등급이 없으면 아무것도 그리지 않는다. */
const TIER_STYLE: Record<string, { name: string; fg: string; bg: string; line: string }> = {
  bronze: { name: "브론즈", fg: "#9A5B32", bg: "#FBF1EA", line: "#E8C9B3" },
  silver: { name: "실버", fg: "#5E6878", bg: "#F1F3F7", line: "#CDD3DD" },
  gold: { name: "골드", fg: "#9A7200", bg: "#FFF6D6", line: "#EED78A" },
};
export function TierBadge({ tier, size = "sm" }: { tier?: string | null; size?: "sm" | "md" }) {
  const t = useT();
  const s = tier ? TIER_STYLE[tier] : undefined;
  if (!s) return null;
  const px = size === "md" ? 16 : 13;
  return (
    <span
      data-block-id="C120"
      data-block-name="운전자 등급 배지"
      title={`${t("운전자 등급")}: ${t(s.name)}`}
      className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border align-middle font-semibold leading-none ${size === "md" ? "px-2.5 py-1 text-[13px]" : "px-1.5 py-[3px] text-[11px]"}`}
      style={{ color: s.fg, background: s.bg, borderColor: s.line }}
    >
      <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 3l2.5 6M16 3l-2.5 6" />
        <circle cx="12" cy="15" r="6" />
        <path d="M12 12.2l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
      </svg>
      {t(s.name)}
    </span>
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
  train: (w = 1.5) => (
    <svg {...base} strokeWidth={w}><rect x="6" y="3.5" width="12" height="13" rx="3" /><path d="M6 11.5h12M9 20.5l-2 1.5M15 20.5l2 1.5M9.5 7h.01M14.5 7h.01" /></svg>
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

/**
 * 시트가 열려 있는 동안 본문 스크롤을 잠근다. 시트가 여러 개 겹쳐 열리고 닫히는 순서가 뒤바뀌어도
 * (예: 메일 링크로 들어와 글 상세 위에 대화방이 열림) 잠금이 남지 않도록 열린 개수로 센다.
 */
let sheetLocks = 0;
let bodyOverflowBefore = "";
function lockBody() {
  if (sheetLocks === 0) {
    const cur = document.body.style.overflow;
    bodyOverflowBefore = cur === "hidden" ? "" : cur;
    document.body.style.overflow = "hidden";
  }
  sheetLocks += 1;
}
function unlockBody() {
  sheetLocks = Math.max(0, sheetLocks - 1);
  if (sheetLocks === 0) document.body.style.overflow = bodyOverflowBefore;
}

export function Sheet({ title, onClose, children, blockId, locked = false }: { title: string; onClose: () => void; children: ReactNode; blockId: string; locked?: boolean }) {
  useEffect(() => {
    lockBody();
    return unlockBody;
  }, []);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-ink/30" role="dialog" aria-modal="true" aria-label={title}>
      <div data-block-id={blockId} data-block-name={title} className="sheet sheet-max safe-b flex w-full max-w-md flex-col rounded-t-[28px] bg-surface shadow-card">
        <div className="flex items-center justify-between px-6 pb-2 pt-4">
          <p className="text-sm font-medium text-sub">{title}</p>
          {!locked && <button onClick={onClose} aria-label="닫기" className="-mr-2 grid w-11 place-items-center text-sub">{Icon.close()}</button>}
        </div>
        <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
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
  const c = tone === "accent" ? "bg-accentSoft text-accent" : tone === "warn" ? "bg-warnSoft text-warn" : tone === "mint" ? "bg-mintSoft text-mint" : "bg-bg text-sub";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-medium ${c}`}>{children}</span>;
}

/** 운전자(파란색)·탑승자(초록색) 표시. 프로필 사진 자리에 쓴다. */
export function RoleTag({ role }: { role?: string }) {
  const t = useT();
  return <Tag tone={role === "driver" ? "accent" : "mint"}>{t(role === "driver" ? "운전자입니다" : "탑승자입니다")}</Tag>;
}

/** 여러 선택지 중 하나를 고르는 버튼 줄 */
/** accents: 고른 항목을 진하게 강조할 색. accent = 파랑, mint = 초록 (운전자·탑승자 구분용) */
export function Segment<T extends string>({ value, options, onChange, label, compact, accents }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; compact?: boolean; accents?: Partial<Record<T, "accent" | "mint" | "violet">> }) {
  const onStyle = (v: T) => {
    const a = accents?.[v];
    if (a === "accent") return "bg-accentSoft font-bold text-accent shadow-sm";
    if (a === "mint") return "bg-mintSoft font-bold text-mint shadow-sm";
    if (a === "violet") return "bg-violetSoft font-bold text-violet shadow-sm";
    return "bg-white font-semibold text-ink shadow-sm";
  };
  return (
    <div role="radiogroup" aria-label={label} className={`flex gap-1 rounded-xl bg-bg ${compact ? "p-0.5" : "p-1"}`}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-2 max-[380px]:px-1 max-[380px]:text-[14px] motion-safe:transition-all motion-safe:duration-200 ${compact ? "min-h-[44px] py-2 text-[15px]" : "min-h-[44px] py-2 text-[15px]"} ${value === v ? onStyle(v) : "text-sub"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * 말풍선 안내. 의미가 헷갈릴 만한 버튼 옆에 둔다. 닫으면 이 기기에서는 다시 보이지 않는다(localStorage, 실패해도 그냥 보임).
 * pointer: 화살표가 위(기본)·아래 중 어디로 향할지. align: 화살표 위치(왼쪽·가운데·오른쪽).
 */
/** 말풍선 표시 상태: 로그인한 회원에게만 보이고, 관리자가 바꾼 한국어 문구를 담는다. */
export const HintContext = createContext<{ on: boolean; texts: Record<string, string> }>({ on: false, texts: {} });

/**
 * 말풍선 안내: 해당 버튼을 처음 누를 때 한 번만 보여 준다(로그인한 회원만).
 * 버튼에서 `if (hintTap("C930")) return;` 처럼 부르면, 처음 누를 때는 설명만 보여 주고 다음부터는 바로 실행된다.
 * 본 적이 있는지는 이 기기의 localStorage(hint:블록ID)에 남긴다. 저장소를 못 쓰면 안내 없이 바로 실행한다.
 */
const HINT_EVENT = "modu-hint";
export function useHintTap() {
  const hint = useContext(HintContext);
  return (blockId: string): boolean => {
    if (!hint.on) return false;
    const key = `hint:${blockId}`;
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
    } catch {
      return false;
    }
    window.dispatchEvent(new CustomEvent(HINT_EVENT, { detail: blockId }));
    return true;
  };
}

/** 말풍선: 진한 회색 바탕에 흰 글자. useHintTap으로 불렸을 때만 잠깐(8초) 나타난다. 관리자가 바꾼 한국어 문구가 있으면 그 문구를 쓴다. */
export function Bubble({ blockId, children, pointer = "top", align = "left" }: { blockId: string; children: ReactNode; pointer?: "top" | "bottom"; align?: "left" | "center" | "right" }) {
  const t = useT();
  const lang = useLang();
  const hint = useContext(HintContext);
  const [show, setShow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      if ((e as CustomEvent).detail !== blockId) return;
      setShow(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShow(false), 8000);
    };
    window.addEventListener(HINT_EVENT, on);
    return () => {
      window.removeEventListener(HINT_EVENT, on);
      clearTimeout(timer);
    };
  }, [blockId]);
  if (!hint.on || !show) return null;
  const arrowPos = align === "center" ? "left-1/2 -translate-x-1/2" : align === "right" ? "right-10" : "left-5";
  const arrowEdge = pointer === "top" ? "-top-1.5" : "-bottom-1.5";
  const text = lang === "ko" && hint.texts[blockId] ? hint.texts[blockId] : children;
  return (
    <div role="note" aria-live="polite" data-block-id={blockId} className={`fade-in relative inline-flex max-w-full items-start gap-2 rounded-xl bg-[#374151] px-3.5 py-2.5 text-[14px] font-medium leading-snug text-white shadow-card ${pointer === "top" ? "mt-2" : "mb-2"}`}>
      <span aria-hidden className={`absolute ${arrowEdge} ${arrowPos} h-3 w-3 rotate-45 bg-[#374151]`} />
      <span className="min-w-0">
        {text}
        <span className="mt-1 block text-[12px] font-normal text-white/75">{t("한 번 더 누르면 실행돼요.")}</span>
      </span>
      <button type="button" aria-label={t("닫기")} onClick={() => setShow(false)} className="min-h-0 shrink-0 px-0.5 text-[15px] leading-none text-white/80">×</button>
    </div>
  );
}

export const btnPrimary = "w-full rounded-2xl bg-accent px-5 py-4 text-[17px] font-semibold text-white active:opacity-90 disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97]";
// 버튼 색 규칙: 운전자가 누르는 주 버튼 = 파랑(btnPrimary), 탑승자가 누르는 주 버튼 = 초록(btnRider).
// 글 상세의 버튼은 글쓴이 역할 색(운전자 글 파랑·탑승자 글 초록). 역할과 무관한 공통 주 버튼 = 파랑.
// 보조 = 흰 바탕·회색 테두리·검정 글씨(btnGhost), 작은 부가 동작 = 글자색만, 위험(탈퇴·삭제) = bg-warn, 지하철 = 보라. 색은 hex 대신 토큰.
export const btnRider = btnPrimary.replace("bg-accent", "bg-mint");
export const btnRole = (role: string | null | undefined) => (role === "rider" ? btnRider : btnPrimary);
export const btnGhost = "w-full rounded-2xl border border-line bg-white px-5 py-4 text-[17px] font-semibold text-ink active:bg-bg disabled:opacity-40 motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97]";
export const field = "w-full rounded-xl border border-line bg-white px-3 py-3 text-[16px] text-ink outline-none focus:border-accent";
