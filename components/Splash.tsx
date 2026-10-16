"use client";
import { useLang, useT } from "./ui";

/**
 * 첫 진입 로딩 화면. 로그인 확인과 글 목록을 받는 동안 보여 주고, 끝나면 사라진다.
 * 한국어는 기능을 소개하는 화면을, 다른 언어는 로고와 글자로 보여 준다.
 * 한 화면에 모두 들어가며, PC는 두 칸, 휴대폰은 한 줄로 배치한다.
 */

const FEATURES: { title: string; desc: string; soon?: boolean }[] = [
  { title: "출퇴근 카풀", desc: "같은 길로 가는 사람을 찾아요." },
  { title: "나들이 카풀", desc: "주말 서울 나들이 길을 함께해요." },
  { title: "채팅으로 약속", desc: "신청하고 대화하며 시간을 맞춰요." },
  { title: "안심 운행", desc: "프로필과 차량 등록, 신뢰 등급으로 확인해요." },
  { title: "택시 동승", desc: "택시를 나눠 타고 요금을 나눠요." },
  { title: "지하철 자리나눔", desc: "함께 탈 자리를 나눠요.", soon: true },
];

const css = `
.sp-rise{opacity:0;transform:translateY(10px);animation:sp-rise .7s cubic-bezier(.2,.7,.2,1) forwards}
.sp-d1{animation-delay:.05s}.sp-d2{animation-delay:.15s}.sp-d3{animation-delay:.25s}.sp-d4{animation-delay:.35s}.sp-d5{animation-delay:.45s}.sp-d6{animation-delay:.55s}
@keyframes sp-rise{to{opacity:1;transform:none}}
.sp-route{display:none}
@media (min-width:860px),(min-height:800px){.sp-route{display:block}}
.sp-trail{stroke-dasharray:2 8;animation:sp-flow 2.4s linear infinite}
@keyframes sp-flow{to{stroke-dashoffset:-40}}
.sp-car{animation:sp-drive 3.6s ease-in-out infinite alternate}
@keyframes sp-drive{from{transform:translate(0,0)}to{transform:translate(6px,-4px)}}
@media (prefers-reduced-motion:reduce){.sp-route{display:block}.sp-rise{opacity:1;transform:none;animation:none}.sp-trail,.sp-car{animation:none}}
`;

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
      <div data-block-id="S300" data-block-name="첫 로딩 화면" className="fixed inset-0 z-[70] overflow-hidden bg-[#F3F8FF] text-[#15233D]" style={{ fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif' }}>
        <style>{css}</style>
        <div className="mx-auto flex h-full max-w-[1040px] flex-col justify-between gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+16px)] md:grid md:grid-cols-2 md:items-center md:gap-x-16 md:py-10 md:[grid-template-rows:auto_1fr_auto]">
          <div className="sp-rise sp-d1 flex items-center gap-2.5 text-base font-black md:col-start-1 md:row-start-1">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-accent" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 64 64"><path d="M14 38l4-11a5 5 0 0 1 4.7-3.3h18.6A5 5 0 0 1 46 27l4 11v8H14z" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" /><circle cx="23" cy="39" r="2.6" fill="#fff" /><circle cx="41" cy="39" r="2.6" fill="#fff" /></svg>
            </span>
            모두의카풀
          </div>

          <div className="flex flex-col gap-4 md:col-start-1 md:row-start-2">
            <div className="sp-rise sp-d2">
              <h1 className="text-[clamp(28px,4.6dvh,44px)] font-black leading-[1.2] tracking-[-0.02em] [text-wrap:balance]">
                같은 방향,
                <br />
                <span className="text-accent">같이 가요.</span>
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-[#5B6B85] md:text-base">
                출퇴근길도 서울 나들이도, 방향이 같은 사람과 함께 가는 카풀 매칭 서비스예요. 무료 운행을 원칙으로 해요.
              </p>
            </div>

            <div className="sp-rise sp-d3 sp-route rounded-[20px] border border-[#DCE6F7] bg-white p-4 shadow-[0_10px_30px_rgba(47,107,255,0.08)]">
              <svg viewBox="0 0 320 120" role="img" aria-label="출발지에서 도착지까지 같은 방향으로 가는 경로" className="block h-auto max-h-[30dvh] w-full">
                <path className="sp-trail" d="M40 84 C 100 84, 110 36, 170 44 S 260 40, 282 30" fill="none" stroke="#2F6BFF" strokeWidth="3" strokeLinecap="round" />
                <circle cx="40" cy="84" r="9" fill="#fff" stroke="#2F6BFF" strokeWidth="3" />
                <circle cx="282" cy="30" r="9" fill="#2F6BFF" />
                <g className="sp-car" transform="translate(150 26)">
                  <rect x="0" y="6" width="44" height="20" rx="8" fill="#2F6BFF" />
                  <rect x="8" y="0" width="26" height="12" rx="5" fill="#2F6BFF" opacity="0.7" />
                  <circle cx="11" cy="28" r="4" fill="#15233D" />
                  <circle cx="33" cy="28" r="4" fill="#15233D" />
                </g>
                <circle cx="90" cy="70" r="5" fill="#12B886" />
                <circle cx="232" cy="46" r="5" fill="#12B886" />
              </svg>
              <div className="mt-1 flex justify-between text-[13px] text-[#5B6B85]">
                <span>출발 <b className="font-bold text-[#15233D]">장안동</b></span>
                <span>도착 <b className="font-bold text-[#15233D]">강남역</b></span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:col-start-2 md:row-span-2 md:row-start-1 md:gap-3">
            {FEATURES.map((f, i) => (
              <article key={f.title} className={`sp-rise sp-d${Math.min(i + 3, 6)} min-w-0 rounded-2xl border border-[#DCE6F7] bg-white p-3 md:p-[18px]`}>
                <h2 className="text-[15px] font-bold">{f.title}</h2>
                <p className="mt-0.5 text-[13px] leading-snug text-[#5B6B85] md:text-sm">{f.desc}</p>
                {f.soon && <span className="mt-1 inline-block rounded-full bg-[#DDF8EF] px-2 py-px text-[11px] font-bold text-[#0B7A5A]">곧 만나요</span>}
              </article>
            ))}
          </div>

          <div className="sp-rise sp-d6 flex flex-col gap-3 md:col-span-2 md:row-start-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              {bar}
              <p className="m-0 text-sm text-[#5B6B85]">내 주변 카풀을 불러오는 중이에요</p>
            </div>
            <nav className="flex flex-wrap gap-2 text-xs text-[#5B6B85]" aria-label="언어">
              <span className="rounded-full border border-accent bg-white px-2.5 py-0.5 font-bold text-accent">한국어</span>
              <span className="rounded-full border border-[#DCE6F7] bg-white px-2.5 py-0.5">English</span>
              <span className="rounded-full border border-[#DCE6F7] bg-white px-2.5 py-0.5">日本語</span>
              <span className="rounded-full border border-[#DCE6F7] bg-white px-2.5 py-0.5">中文</span>
            </nav>
          </div>
        </div>
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
