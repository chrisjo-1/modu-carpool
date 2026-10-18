"use client";
import { useLang, useT } from "./ui";

/**
 * 첫 진입 로딩 화면. 로그인 확인과 글 목록을 받는 동안 보여 주고, 끝나면 사라진다.
 * 한국어는 소개 그림(public/splash-main.webp, 약 94KB)을, 다른 언어는 로고와 글자로 보여 준다.
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
        className="splash-full fixed inset-0 z-[70] overflow-hidden bg-[linear-gradient(180deg,#CCEAFD_0%,#CCEAFD_55%,#F6FAFF_100%)]"
      >
        {/* 그림이 늦게 떠도 같은 하늘색 배경이 먼저 보인다. 휴대폰은 그림이 화면을 채우고, PC는 가운데 세로로 놓인다. */}
        {/* 배경 그림으로 넣어, 다시 온 사람(화면이 숨겨짐)은 그림을 내려받지 않게 한다. */}
        <div
          role="img"
          aria-label="모두의카풀 — 카풀부터 지하철 앉기까지, 출퇴근·나들이 모두 CALL 하세요"
          className="sp-fade absolute inset-0 bg-contain bg-bottom bg-no-repeat"
          style={{ backgroundImage: "url(/splash-main.webp)", WebkitMaskImage: "linear-gradient(180deg, transparent 0, transparent calc(100% - min(100dvh, 177.9vw)), #000 calc(100% - min(100dvh, 177.9vw) * 0.94))", maskImage: "linear-gradient(180deg, transparent 0, transparent calc(100% - min(100dvh, 177.9vw)), #000 calc(100% - min(100dvh, 177.9vw) * 0.94))" }}
        />
        <style>{`.sp-fade{animation:sp-fade .5s ease-out both}@keyframes sp-fade{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){.sp-fade{animation:none}}`}</style>
        {/* 그림 아래쪽 흰 물결 위에 로딩 막대를 얹는다(그림 높이 기준 약 11% 위). */}
        <div className="absolute inset-x-0 flex flex-col items-center gap-2" style={{ bottom: "calc(min(100dvh, 177.9vw) * 0.115)" }}>
          {bar}
          <p className="m-0 text-[13px] font-medium text-[#5B6B85]">{t("내 주변 카풀을 불러오는 중이에요")}</p>
        </div>
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
