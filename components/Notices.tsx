"use client";
import { useEffect, useState } from "react";
import { Sheet, api, btnPrimary, useLang, useT } from "./ui";

type Notice = { id: number; title: string; body: string; read: boolean; at: number };
const day = (ms: number, lang: string) => new Date(ms).toLocaleDateString(lang === "ko" ? "ko-KR" : lang, { year: "numeric", month: "long", day: "numeric" });

/** 로그인한 회원에게 아직 확인하지 않은 공지를 하나씩 팝업으로 보여 준다. */
export function NoticePopup({ userId, focus }: { userId: string | null; focus: number }) {
  const t = useT();
  const lang = useLang();
  const [queue, setQueue] = useState<Notice[]>([]);

  useEffect(() => {
    if (!userId) return setQueue([]);
    let alive = true;
    (async () => {
      const r = await api<{ notices: Notice[] }>("/api/notices");
      let list = r.ok ? r.data.notices : [];
      // 푸시를 눌러 들어왔는데 이미 확인한 공지면 전체 목록에서 찾아 보여 준다.
      if (focus && !list.some((n) => n.id === focus)) {
        const all = await api<{ notices: Notice[] }>("/api/notices?all=1");
        const hit = all.ok && all.data.notices.find((n) => n.id === focus);
        if (hit) list = [hit, ...list];
      }
      if (focus) list = [...list.filter((n) => n.id === focus), ...list.filter((n) => n.id !== focus)];
      if (alive) setQueue(list);
    })();
    return () => {
      alive = false;
    };
  }, [userId, focus]);

  const n = queue[0];
  if (!n) return null;
  const close = async () => {
    setQueue((q) => q.slice(1));
    if (!n.read) await api("/api/notices", "POST", { id: n.id });
  };
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-ink/30 p-5" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <div data-block-id="S084" data-block-name="공지 팝업" className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-card">
        <div>
          <p className="text-[13px] font-semibold text-accent">{t("공지사항")}{queue.length > 1 && <span className="ml-1 text-sub">1/{queue.length}</span>}</p>
          <h2 id="notice-title" className="mt-1 text-xl font-bold leading-snug">{n.title}</h2>
          <p className="num mt-1 text-[13px] text-sub">{day(n.at, lang)}</p>
        </div>
        <p className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-relaxed">{n.body}</p>
        <button data-block-id="B084" data-block-name="공지 확인" className={btnPrimary} onClick={close}>{t("확인")}</button>
      </div>
    </div>
  );
}

/** 내 정보: 지난 공지 */
export function NoticeList({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [list, setList] = useState<Notice[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    api<{ notices: Notice[] }>("/api/notices?all=1").then((r) => setList(r.ok ? r.data.notices : []));
  }, []);
  return (
    <Sheet title={t("공지사항")} blockId="S085" onClose={onClose}>
      {!list ? (
        <div className="h-32 animate-pulse rounded-2xl bg-bg" aria-hidden />
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sub">{t("아직 공지가 없어요.")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((n) => (
            <li key={n.id} className="py-3">
              <button className="flex min-h-0 w-full items-start justify-between gap-3 text-left" onClick={() => setOpenId(openId === n.id ? null : n.id)} aria-expanded={openId === n.id}>
                <span className="min-w-0">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="num text-[12px] text-sub">{day(n.at, lang)}</span>
                </span>
                {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warn" aria-label={t("새 공지")} />}
              </button>
              {openId === n.id && <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-bg px-4 py-3 text-[15px] leading-relaxed">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
