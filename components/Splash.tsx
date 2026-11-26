"use client";
import { useLang, useT } from "./ui";

/**
 * 첫 진입 로딩 화면. 로그인 확인과 글 목록을 받는 동안 보여 주고, 끝나면 사라진다.
 * 한국어는 소개 그림(public/splash-v2.webp, 약 56KB, 2026-11-26 한강 노을·출근길 카풀·지하철·손편지)에 도는 로딩 원을 얹고,
 * 다른 언어는 로고와 글자로 보여 준다.
 * 첫 방문에만 보이므로(html[data-seen]) 다시 온 사람은 그림을 받지 않는다.
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
      <div
        data-block-id="S300"
        data-block-name="첫 로딩 화면"
        className="splash-full fixed inset-0 z-[70] flex justify-center overflow-hidden bg-[#EAF3FF]"
      >
        {/* 그림(9:16)은 화면 높이에 맞춰 놓는다. 휴대폰은 좌우만 조금 잘리고, PC는 가운데 세로로 놓인다. */}
        {/* 그림이 늦게 떠도 하늘·노을 색이 먼저 보이고, 배경 그림이라 다시 온 사람(화면이 숨겨짐)은 그림을 받지 않는다. */}
        <div className="relative h-[var(--vh100)] w-[min(100vw,calc(var(--vh100)*0.5628))] bg-[linear-gradient(180deg,#5B6FD0_0%,#B98AC8_40%,#F4A868_55%,#6E6A78_75%,#4B4852_100%)]">
          <div
            role="img"
            aria-label="모두의카풀 — 출근길 카풀, 지하철 앉아가기, 손편지"
            className="sp-fade absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url(/splash-v2.webp)" }}
          />
          {/* 그림 속 로딩 원 자리(세로 84%)에 실제로 도는 원을 얹는다. 크기는 그림 높이의 5%. */}
          <div
            role="progressbar"
            aria-label={t("불러오는 중")}
            className="sp-spin absolute left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white/35 border-t-white"
            style={{ top: "84.15%", height: "5.1%" }}
          />
        </div>
        <style>{`.sp-fade{animation:sp-fade .5s ease-out both}@keyframes sp-fade{from{opacity:0}to{opacity:1}}.sp-spin{animation:sp-spin .9s linear infinite}@keyframes sp-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}@media (prefers-reduced-motion:reduce){.sp-fade{animation:none}.sp-spin{animation-duration:2.4s}}`}</style>
      </div>
    );
  return (
    <div data-block-id="S300" data-block-name="첫 로딩 화면" className="splash-full fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 bg-[#EAF3FF] px-6">
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
