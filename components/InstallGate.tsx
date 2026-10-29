"use client";
import { useEffect, useState } from "react";
import { btnPrimary, useT } from "./ui";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Env = "android" | "ios" | "inapp-kakao" | "inapp-android" | "inapp-ios";

const LATER = "modu.install.later"; // 권유 모드에서 [나중에]를 누른 창(sessionStorage)

/** 휴대폰 종류와 브라우저를 본다. 카카오톡·네이버·인스타그램 등 앱 안 브라우저는 설치가 안 된다. */
export function installEnv(): Env | null {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (!ios && !android) return null;
  if (/KAKAOTALK/i.test(ua)) return "inapp-kakao";
  if (/NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return ios ? "inapp-ios" : "inapp-android";
  return ios ? "ios" : "android";
}

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** 공유 아이콘(아이폰 사파리 아래쪽 네모에 화살표) */
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-[-4px] text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M12 3v12M8 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" strokeLinecap="round" />
  </svg>
);
const DotsIcon = () => (
  <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-[-4px] text-accent" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

/**
 * 앱 설치 안내 창. 휴대폰에서 인터넷 창으로 들어왔을 때만 뜬다(이미 설치한 앱·PC에서는 안 뜸).
 * mode = nudge: [나중에]로 이 창을 닫을 수 있다. require: 닫기 없음(설치한 앱으로만 이용).
 */
export default function InstallGate({ mode }: { mode: "nudge" | "require" }) {
  const t = useT();
  const [env, setEnv] = useState<Env | null>(null);
  const [open, setOpen] = useState(false);
  const [bip, setBip] = useState<BIP | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const e = installEnv();
    if (!e) return;
    try {
      if (mode === "nudge" && sessionStorage.getItem(LATER)) return;
    } catch {
      /* 무시 */
    }
    setEnv(e);
    // 페이지 맨 처음(layout)에 받아 둔 설치 신호가 있으면 쓰고, 없으면 지금부터 기다린다.
    const w = window as unknown as { __bip?: BIP };
    if (w.__bip) setBip(w.__bip);
    const onBip = (ev: Event) => {
      ev.preventDefault();
      setBip(ev as BIP);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    // 권유 모드는 다른 창(접속 팝업·가입 단계 등)이 닫힌 뒤에 띄운다. 필수 모드는 바로.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryOpen = () => {
      if (mode === "nudge" && document.querySelector('[role="dialog"][aria-modal="true"]') && tries++ < 60) {
        timer = setTimeout(tryOpen, 2000);
        return;
      }
      setOpen(true);
    };
    timer = setTimeout(tryOpen, mode === "require" ? 300 : 2500);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [mode]);

  if (!open || !env) return null;

  const later = () => {
    try {
      sessionStorage.setItem(LATER, "1");
    } catch {
      /* 무시 */
    }
    setOpen(false);
  };
  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    const r = await bip.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (r.outcome === "accepted") setDone(true);
    setBip(null);
  };
  const here = typeof location !== "undefined" ? location.href : "https://moducarpool.com/";
  const openOutside = () => {
    if (env === "inapp-kakao") location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(here)}`;
    else if (env === "inapp-android") location.href = `intent://${here.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  return (
    <div className="fade-in fixed inset-0 z-[70] flex items-end justify-center bg-ink/60 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center" role="dialog" aria-modal="true" aria-label={t("앱 설치 안내")} data-block-id="S410" data-block-name="앱 설치 안내">
      <div className="w-full max-w-[380px] space-y-4 rounded-3xl bg-white p-6 shadow-card">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-2xl" />
          <div>
            <p className="text-[18px] font-bold text-ink">{t("모두의카풀 앱으로 이용해 주세요")}</p>
            <p className="text-[13px] text-sub">{t("설치는 무료, 10초면 끝나요 · 용량도 거의 없어요")}</p>
          </div>
        </div>
        <ul className="space-y-1 rounded-2xl bg-bg px-4 py-3 text-[14px] leading-relaxed text-ink">
          <li>· {t("신청·채팅 알림을 바로 받아요")}</li>
          <li>· {t("홈 화면 아이콘으로 한 번에 열려요")}</li>
          <li>· {t("로그인이 풀리지 않아요")}</li>
        </ul>

        {done ? (
          <p className="rounded-2xl bg-accentSoft px-4 py-3 text-[15px] font-semibold text-accent">{t("설치됐어요! 홈 화면의 모두의카풀 아이콘으로 열어 주세요.")}</p>
        ) : env === "android" ? (
          bip ? (
            <button type="button" data-block-id="B410" data-block-name="앱 설치하기" className={btnPrimary} onClick={install}>{t("앱 설치하기")}</button>
          ) : (
            <ol className="space-y-2 text-[15px] leading-relaxed text-ink">
              <li>1. {t("오른쪽 위 또는 아래의")} <DotsIcon /> {t("메뉴(또는 ≡)를 누르세요")}</li>
              <li>2. <b>{t("앱 설치")}</b> {t("또는")} <b>{t("홈 화면에 추가")}</b>{t("를 누르세요")}</li>
              <li>3. {t("홈 화면의 모두의카풀 아이콘으로 열어 주세요")}</li>
            </ol>
          )
        ) : env === "ios" ? (
          <ol className="space-y-2 text-[15px] leading-relaxed text-ink">
            <li>1. {t("사파리 아래쪽(또는 위쪽)의")} <ShareIcon /> {t("공유 버튼을 누르세요")}</li>
            <li>2. {t("아래로 내려")} <b>{t("홈 화면에 추가")}</b>{t("를 누르세요")}</li>
            <li>3. {t("오른쪽 위")} <b>{t("추가")}</b>{t("를 누르고, 홈 화면 아이콘으로 열어 주세요")}</li>
          </ol>
        ) : (
          <div className="space-y-3">
            <p className="text-[15px] leading-relaxed text-ink">{t("지금 보시는 창(카카오톡·네이버 등 앱 안 화면)에서는 설치가 안 돼요.")} {env === "inapp-ios" ? t("오른쪽 아래(또는 위) 메뉴에서 'Safari로 열기'를 누른 뒤 공유 → 홈 화면에 추가를 해 주세요.") : t("크롬으로 연 뒤 설치해 주세요.")}</p>
            {env !== "inapp-ios" && (
              <button type="button" data-block-id="B411" data-block-name="외부 브라우저로 열기" className={btnPrimary} onClick={openOutside}>{t("크롬(인터넷)으로 열기")}</button>
            )}
          </div>
        )}

        {mode === "nudge" ? (
          <button type="button" data-block-id="B412" onClick={later} className="w-full py-2 text-[14px] text-sub underline">{t("나중에 할게요")}</button>
        ) : (
          <p className="text-center text-[12px] text-sub">{t("모두의카풀은 설치한 앱으로 이용할 수 있어요.")}</p>
        )}
      </div>
    </div>
  );
}
