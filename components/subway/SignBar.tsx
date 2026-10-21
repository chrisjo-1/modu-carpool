"use client";
import type { ReactNode } from "react";
import { ALL_LINES, lineColor } from "@/lib/subway";

/**
 * 역 표지판 띠(공용). 노선색 띠 위에 [왼쪽 역 | 노선 번호 + 지금 역 | 오른쪽 역].
 * 세 칸이 나란히 놓여 서로 덮지 않고, 긴 이름은 글자를 줄여 두 줄까지 보여 준다.
 * 밝은 노선색(9호선 등)은 짙은 글자를 쓴다.
 */
export function SignBar({ line, station, left, right }: { line: string; station: string; left: ReactNode; right: ReactNode }) {
  const c = lineColor(line);
  const mark = /^\d$/.test(line) ? line : (ALL_LINES.find((l) => l.id === line)?.name ?? line).slice(0, 1);
  // 가운데 이름이 길수록 글자를 줄여 두 줄 안에 다 보이게 한다.
  const nameSize = station.length > 7 ? "text-[11.5px]" : station.length > 4 ? "text-[13px]" : "text-[16px]";
  return (
    <div className="flex items-stretch rounded-full" style={{ background: c.bg, color: c.text }}>
      <div className="flex min-w-0 flex-1 items-center">{left}</div>
      <div className="-my-1.5 flex max-w-[40%] shrink-0 items-center gap-1 rounded-full border-[3px] bg-white px-2.5 py-1" style={{ borderColor: c.bg }}>
        <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold" style={{ background: c.bg, color: c.text }}>{mark}</span>
        <span className={`line-clamp-2 font-bold leading-tight text-ink [word-break:break-all] ${nameSize}`}>{station}</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end">{right}</div>
    </div>
  );
}

/** 띠 양쪽의 역 이름. 고른 쪽은 진하게, 반대쪽은 조금 흐리게(그래도 읽을 수 있게). */
export function SignSide({ name, at, on }: { name: string; at: "left" | "right"; on: boolean }) {
  // 옆 칸은 좁아서 4글자를 넘으면 글자를 줄여 한 줄에 들어가게 한다.
  const size = name.length > 5 ? "text-[11px]" : name.length > 3 ? "text-[12.5px]" : "text-[14px]";
  return (
    <span className={`flex min-h-[44px] w-full min-w-0 items-center gap-0.5 ${at === "left" ? "justify-start pl-2 pr-1" : "justify-end pl-1 pr-2"} ${on ? "font-bold" : "font-medium"}`} style={{ opacity: on ? 1 : 0.72 }}>
      {at === "left" && <span aria-hidden className="shrink-0 text-[18px] leading-none">‹</span>}
      <span className={`line-clamp-2 leading-tight [word-break:break-all] ${at === "right" ? "text-right" : ""} ${size}`}>{name}</span>
      {at === "right" && <span aria-hidden className="shrink-0 text-[18px] leading-none">›</span>}
    </span>
  );
}
