"use client";

/** 단계 제목: 남색 번호 점 + 제목 */
export function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-bold text-sub">
      <span className="num grid h-[18px] w-[18px] place-items-center rounded-full bg-brand text-[11px] text-white">{n}</span>
      {title}
    </p>
  );
}
