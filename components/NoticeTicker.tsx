"use client";
import { useEffect, useState } from "react";
import { api, useT } from "./ui";

type Item = { id: number; title: string };

/**
 * 홈 위 한 줄 공지 띠. 켜진 최근 공지 제목이 오른쪽에서 왼쪽으로 흐른다. 누르면 그 공지를 연다.
 * 공지가 없거나 로그인 전이면 아무것도 그리지 않는다. 움직임 줄이기 설정이면 멈춘 한 줄로 보인다.
 */
export default function NoticeTicker({ enabled, onOpen }: { enabled: boolean; onOpen: (id: number) => void }) {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (!enabled) return setItems([]);
    let alive = true;
    api<{ notices: Item[] }>("/api/notices?ticker=1").then((r) => alive && setItems(r.ok ? r.data.notices : []));
    return () => {
      alive = false;
    };
  }, [enabled]);
  if (!items.length) return null;
  const text = items.map((n) => n.title).join("   ·   ");
  // 글자 수에 맞춰 속도를 일정하게(대략 초당 6글자 정도)
  const seconds = Math.min(40, Math.max(10, Math.round(text.length / 2.2)));
  return (
    <button
      type="button"
      data-block-id="C095"
      data-block-name="공지 띠"
      aria-label={`${t("공지")}: ${text}`}
      onClick={() => onOpen(items[0].id)}
      className="flex min-h-0 w-full items-center gap-2 overflow-hidden rounded-xl border border-line bg-white px-3 py-2 text-left"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 10v4h3l5 4V6L7 10H4z" />
        <path d="M16 9a4 4 0 0 1 0 6" />
      </svg>
      <span className="relative min-w-0 flex-1 overflow-hidden">
        <span className="ticker-run inline-block whitespace-nowrap text-[13px] font-medium text-ink" style={{ animationDuration: `${seconds}s` }}>
          {text}
        </span>
      </span>
    </button>
  );
}
