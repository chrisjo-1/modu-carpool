"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "./ui";

type Item = { id: string; title: string; body?: string; image: string; link: string; ad?: boolean };

const HIDE = "modu.popup.hide"; // 오늘 하루 보지 않기(날짜)
const SEEN = "modu.popup.seen"; // 이번 접속에 이미 보여 줌
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const read = (s: () => Storage, k: string) => {
  try {
    return s().getItem(k);
  } catch {
    return null;
  }
};
const write = (s: () => Storage, k: string, v: string) => {
  try {
    s().setItem(k, v);
  } catch {
    /* 무시 */
  }
};

/**
 * 앱 접속 팝업. 첫 화면이 뜬 뒤 한가할 때 불러오고, 다른 창(시트)이 열려 있으면 닫힐 때까지 기다린다.
 * 2개 이상이면 interval초마다 다음 팝업으로 넘어가고, 좌우로 밀거나 점을 눌러 바꿀 수 있다.
 * 이미지를 누르면 링크로 이동(사이트 안 경로는 이 창에서, 외부 주소는 새 창). 접속당 한 번, [오늘 하루 보지 않기]는 그날 숨김.
 */
export default function LaunchPopup() {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [sec, setSec] = useState(4);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);

  useEffect(() => {
    if (read(() => localStorage, HIDE) === today() || read(() => sessionStorage, SEEN)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch("/api/popups")
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !Array.isArray(j.popups) || !j.popups.length) return;
        setItems(j.popups);
        setSec(Math.max(2, Number(j.interval) || 4));
        // 다른 창이 열려 있으면(가입 단계·공지 등) 닫힐 때까지 기다렸다가 띄운다(최대 1분)
        let tries = 0;
        const tryOpen = () => {
          if (!alive) return;
          if (document.querySelector('[role="dialog"][aria-modal="true"]') && tries++ < 30) {
            timer = setTimeout(tryOpen, 2000);
            return;
          }
          if (tries > 30) return;
          write(() => sessionStorage, SEEN, "1");
          setOpen(true);
        };
        timer = setTimeout(tryOpen, 1200);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 자동으로 넘기기(2개 이상, 누르고 있는 동안·움직임 줄이기 설정이면 멈춤)
  useEffect(() => {
    if (!open || items.length < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((v) => (v + 1) % items.length), sec * 1000);
    return () => clearInterval(id);
  }, [open, items.length, sec, paused]);

  if (!open || !items.length) return null;
  const cur = items[i % items.length];
  const close = () => setOpen(false);
  const hideToday = () => {
    write(() => localStorage, HIDE, today());
    setOpen(false);
  };
  const go = () => {
    if (!cur.link) return;
    if (/^https?:\/\//i.test(cur.link)) window.open(cur.link, "_blank", "noopener,noreferrer");
    else {
      setOpen(false);
      window.location.href = cur.link;
    }
  };
  const step = (d: number) => setI((v) => (v + d + items.length) % items.length);

  return (
    <div className="fade-in fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 px-6" role="dialog" aria-modal="true" aria-label={t("알림 팝업")} data-block-id="S340" data-block-name="앱 접속 팝업">
      <div className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-white shadow-card">
        <div
          className="relative"
          onTouchStart={(e) => {
            touch.current = e.touches[0].clientX;
            setPaused(true);
          }}
          onTouchEnd={(e) => {
            const s = touch.current;
            touch.current = null;
            setPaused(false);
            if (s == null) return;
            const dx = e.changedTouches[0].clientX - s;
            if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <button type="button" data-block-id="B340" data-block-name="팝업 이미지" onClick={go} className={`block w-full ${cur.link ? "cursor-pointer" : "cursor-default"}`} aria-label={cur.link ? `${cur.title} · ${t("자세히 보기")}` : cur.title}>
            {cur.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={cur.id} src={cur.image} alt={cur.title} className="fade-in block h-auto max-h-[62vh] w-full bg-white object-contain" />
            ) : null}
            {(!cur.image || cur.body || cur.ad) && (
              // 홈 배너(이미지 없는 글 배너·설명·광고 표시)
              <div key={`${cur.id}-t`} className={`fade-in space-y-1.5 px-5 text-left ${cur.image ? "py-3" : "pb-9 pt-7"}`}>
                <p className="flex items-center gap-2">
                  {cur.ad && <span className="shrink-0 rounded bg-bg px-1.5 py-px text-[11px] text-sub">{t("광고")}</span>}
                  {!cur.image && <span className="text-[18px] font-bold leading-snug text-ink">{cur.title}</span>}
                </p>
                {cur.body && <p className="text-[15px] leading-relaxed text-sub">{cur.body}</p>}
                {cur.link && !cur.image && <p className="pt-1 text-[14px] font-semibold text-accent">{t("자세히 보기")} →</p>}
              </div>
            )}
          </button>
          {items.length > 1 && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-0.5">
              {items.map((p, k) => (
                <button key={p.id} type="button" aria-label={`${k + 1}/${items.length}`} aria-current={k === i % items.length} onClick={() => setI(k)} className="min-h-0 p-1">
                  <span className={`block h-2 rounded-full shadow transition-all ${k === i % items.length ? (cur.image ? "w-5 bg-white" : "w-5 bg-accent") : cur.image ? "w-2 bg-white/60" : "w-2 bg-line"}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex border-t border-line text-[14px]">
          <button type="button" data-block-id="B341" onClick={hideToday} className="min-h-[48px] flex-1 text-sub">{t("오늘 하루 보지 않기")}</button>
          <span className="w-px bg-line" aria-hidden />
          <button type="button" data-block-id="B342" onClick={close} className="min-h-[48px] flex-1 font-semibold text-ink">{t("닫기")}</button>
        </div>
      </div>
    </div>
  );
}
