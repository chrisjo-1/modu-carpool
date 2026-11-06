"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Icon, api, useT } from "./ui";

const AlertsSheet = dynamic(() => import("./AlertsSheet"), { ssr: false });

/**
 * 헤더의 알림함 종(2026-11-06 사용자 지시: "알림 내역이 쌓이고 확인하는 버튼이 없네").
 * 안 읽은 수만 가볍게 묻는다(처음 + 화면이 보일 때 1분마다). 목록은 누를 때 불러온다.
 */
export default function AlertBell({ toast }: { toast: (m: string) => void }) {
  const t = useT();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ unread: number }>("/api/inbox?count=1").then((r) => { if (alive && r.ok) setUnread(r.data.unread); });
    };
    const first = setTimeout(load, 1500); // 첫 화면을 막지 않게 조금 뒤에
    const id = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearTimeout(first); clearInterval(id); document.removeEventListener("visibilitychange", load); };
  }, []);
  return (
    <>
      <button type="button" data-block-id="B492" data-block-name="알림함" aria-label={`${t("알림함")}${unread ? ` ${unread}` : ""}`} onClick={() => setOpen(true)}
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink active:bg-bg">
        <span className="h-6 w-6">{Icon.bell()}</span>
        {unread > 0 && <span className="num absolute right-1 top-1 min-w-[18px] rounded-full bg-coral px-1 text-center text-[11px] font-bold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <AlertsSheet onClose={() => setOpen(false)} onUnread={setUnread} toast={toast} />}
    </>
  );
}
