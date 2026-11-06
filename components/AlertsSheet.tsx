"use client";
import { useEffect, useState } from "react";
import { Sheet, api, useLang, useT, when } from "./ui";

type Item = { id: number; title: string; body: string; url: string; at: number; read: boolean };

/** 앱 안 알림함: 최근 50개, 안 읽은 것은 굵게·점. 누르면 읽음 처리 후 그 화면으로. [모두 읽음] */
export default function AlertsSheet({ onClose, onUnread, toast }: { onClose: () => void; onUnread: (n: number) => void; toast: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ unread: number; items: Item[] }>("/api/inbox").then((r) => {
      if (!r.ok) return toast(t(r.error));
      setItems(r.data.items);
      onUnread(r.data.unread);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = async (it: Item) => {
    if (!it.read) {
      const r = await api<{ unread: number }>("/api/inbox", "POST", { action: "read", id: it.id });
      if (r.ok) onUnread(r.data.unread);
    }
    if (it.url && it.url !== "/") location.assign(it.url); // 알림을 누른 것과 같은 화면으로 연다
    else {
      setItems((l) => (l ? l.map((x) => (x.id === it.id ? { ...x, read: true } : x)) : l));
    }
  };
  const readAll = async () => {
    setBusy(true);
    const r = await api("/api/inbox", "POST", { action: "readAll" });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setItems((l) => (l ? l.map((x) => ({ ...x, read: true })) : l));
    onUnread(0);
  };
  const anyUnread = !!items?.some((x) => !x.read);
  return (
    <Sheet title={t("알림함")} onClose={onClose} blockId="S434">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-sub">{t("최근 30일 알림을 모아 두었어요.")}</p>
          <button type="button" data-block-id="B493" data-block-name="모두 읽음" disabled={busy || !anyUnread} onClick={readAll}
            className="min-h-[40px] rounded-xl border border-line bg-white px-3 text-[14px] font-semibold text-ink disabled:opacity-40">{t("모두 읽음")}</button>
        </div>
        {items === null ? (
          <div className="h-40 animate-pulse rounded-2xl bg-bg" aria-hidden />
        ) : items.length === 0 ? (
          <p className="rounded-2xl bg-bg px-4 py-8 text-center text-[14px] text-sub">{t("아직 받은 알림이 없어요.")}</p>
        ) : (
          <ul data-block-id="C437" data-block-name="알림 목록" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => go(it)} className="flex w-full items-start gap-2.5 px-4 py-3 text-left active:bg-bg">
                  <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${it.read ? "bg-transparent" : "bg-coral"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] ${it.read ? "text-sub" : "font-semibold text-ink"}`}>{it.title}</span>
                    {it.body && <span className="mt-0.5 block text-[13px] leading-snug text-sub">{it.body}</span>}
                    <span className="num mt-1 block text-[12px] text-sub">{when(it.at, lang)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
