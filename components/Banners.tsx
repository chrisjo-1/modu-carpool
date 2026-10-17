"use client";
import { useEffect, useState } from "react";

type Item = { id: string; title: string; body: string; image: string; link: string; ad: boolean };

/** 홈 상단 배너 줄. 저장된 배너가 없으면 아무것도 그리지 않는다. 가로로 넘겨 본다. */
export default function Banners() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch("/api/banners")
      .then((r) => r.json())
      .then((j) => setItems(Array.isArray(j.banners) ? j.banners : []))
      .catch(() => setItems([]));
  }, []);

  if (!items.length) return null;
  return (
    <section data-block-id="S310" data-block-name="홈 배너" aria-label="홈 배너" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {items.map((b) => {
        const external = /^https?:\/\//i.test(b.link);
        const inner = (
          <>
            {b.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image} alt="" loading="lazy" className="h-20 w-full rounded-xl object-cover" />
            )}
            <div className="flex items-center gap-2">
              {b.ad && <span className="shrink-0 rounded bg-bg px-1.5 py-px text-[11px] text-sub">광고</span>}
              <p className="truncate text-[15px] font-bold text-ink">{b.title}</p>
            </div>
            {b.body && <p className="line-clamp-2 text-[13px] leading-snug text-sub">{b.body}</p>}
          </>
        );
        const cls = "flex w-[82%] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-line bg-white p-3 shadow-card max-w-[340px]";
        return b.link ? (
          <a key={b.id} href={b.link} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {inner}
          </a>
        ) : (
          <div key={b.id} className={cls}>
            {inner}
          </div>
        );
      })}
    </section>
  );
}
