"use client";
import { useLang, useT } from "./ui";

/**
 * 첫 진입 로딩 화면. 로그인 확인과 글 목록을 받는 동안 보여 주고, 끝나면 사라진다.
 * 한국어는 준비 그림을, 다른 언어는 로고와 글자로 보여 준다.
 */
export default function Splash() {
  const t = useT();
  const lang = useLang();
  const bar = (
    <div className="h-1.5 w-[min(240px,70vw)] overflow-hidden rounded-full bg-[#2F6BFF]/15" role="progressbar" aria-label={t("불러오는 중")}>
      <div className="modu-bar h-full w-2/5 rounded-full bg-accent" />
    </div>
  );
  if (lang === "ko")
    return (
      <div data-block-id="S300" data-block-name="첫 로딩 화면" className="fixed inset-0 z-[70] bg-[#EAF3FF]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/splash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+20px)] flex justify-center">{bar}</div>
      </div>
    );
  return (
    <div data-block-id="S300" data-block-name="첫 로딩 화면" className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 bg-[#EAF3FF] px-6">
      <span className="grid h-20 w-20 place-items-center rounded-3xl bg-accent text-white">
        <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden><path d="M14 38l4-11a5 5 0 0 1 4.7-3.3h18.6A5 5 0 0 1 46 27l4 11v8H14z" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" /><circle cx="23" cy="39" r="2.6" fill="#fff" /><circle cx="41" cy="39" r="2.6" fill="#fff" /></svg>
      </span>
      <div className="text-center">
        <p className="text-2xl font-bold">{t("모두의카풀")}</p>
        <p className="mt-2 text-[15px] text-sub">{t("모두의카풀을 준비하고 있어요. 조금만 기다려주세요!")}</p>
      </div>
      {bar}
    </div>
  );
}
