"use client";
import { useCallback, useEffect, useState } from "react";
import { api, useT } from "./ui";

export type PushState = "loading" | "unsupported" | "ios-install" | "disabled" | "denied" | "off" | "on";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** 이 기기의 푸시 알림 상태와 켜기/끄기 */
export function usePush(loggedIn: boolean) {
  const [state, setState] = useState<PushState>("loading");
  const [key, setKey] = useState("");

  const check = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const r = await api<{ enabled: boolean; key: string; subscribed: boolean }>(`/api/push${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ""}`);
      if (!r.ok || !r.data.enabled) return setState("disabled");
      setKey(r.data.key);
      setState(sub && r.data.subscribed && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setState("unsupported");
    }
  }, []);

  // 로그인 전에도 지원 여부를 알아야 가입 화면에 '푸시 알림 받기'를 보여줄 수 있다.
  useEffect(() => {
    check();
  }, [loggedIn, check]);

  /** 권한 요청을 이미 시작했다면(가입 버튼을 누른 순간 등) 그 결과를 넘겨받는다. */
  const turnOn = async (asked?: Promise<NotificationPermission>): Promise<string> => {
    const perm = await (asked ?? Notification.requestPermission());
    if (perm !== "granted") {
      setState(perm === "denied" ? "denied" : "off");
      return "알림 권한을 허용해야 푸시를 받을 수 있어요.";
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
      const r = await api("/api/push", "POST", { subscription: sub.toJSON() });
      if (!r.ok) return r.error;
      setState("on");
      return "";
    } catch {
      return "이 브라우저에서는 푸시를 켜지 못했어요.";
    }
  };

  const turnOff = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, "DELETE");
        await sub.unsubscribe();
      }
    } catch {
      /* 무시 */
    }
    setState("off");
  };

  return { state, turnOn, turnOff };
}

export const pushHint: Partial<Record<PushState, string>> = {
  "ios-install": "아이폰은 사파리 공유 버튼 → '홈 화면에 추가'로 설치한 뒤 켤 수 있어요.",
  denied: "브라우저 설정에서 이 사이트의 알림이 차단되어 있어요. 설정에서 허용해 주세요.",
  unsupported: "이 브라우저에서는 푸시알림을 지원하지 않아요",
  disabled: "푸시 알림을 준비 중이에요.",
};

/** 푸시를 쓸 수 없는 브라우저에서 보이는 강조 안내: 지원 브라우저 목록과 이동 링크 */
export function UnsupportedNotice() {
  const t = useT();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
    } catch {
      /* 복사 권한이 없으면 주소를 직접 선택해 복사할 수 있도록 그대로 둔다. */
    }
  };

  return (
    <section data-block-id="C095" data-block-name="미지원 브라우저 안내" className="space-y-3 rounded-2xl border-2 border-[#2F6BFF] bg-[#EEF4FF] p-4">
      <p className="font-semibold text-[#2F6BFF]">{t("이 브라우저에서는 푸시알림을 지원하지 않아요")}</p>
      <p className="text-[14px] leading-relaxed text-ink">{t("푸시알림을 받으려면 아래 브라우저에서 이 사이트를 열어 주세요.")}</p>
      <ul className="space-y-1.5 text-[14px] leading-relaxed text-ink">
        <li>• {t("안드로이드: 크롬, 삼성 인터넷, 엣지")}</li>
        <li>• {t("아이폰·아이패드: 사파리 (iOS 16.4 이상, 홈 화면에 추가 후 실행)")}</li>
        <li>• {t("컴퓨터: 크롬, 엣지, 파이어폭스, 사파리 (macOS 13 이상)")}</li>
      </ul>
      <div className="space-y-2 border-t border-[#2F6BFF]/30 pt-3">
        <p className="text-[13px] font-semibold text-sub">{t("또는 이동 링크")}</p>
        <div className="flex items-center gap-2">
          <a href={origin || undefined} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2.5 text-[14px] font-semibold text-[#2F6BFF] underline">
            {origin || "moducarpool.com"}
          </a>
          <button type="button" data-block-id="B500" data-block-name="이동 링크 복사" onClick={copy} className="shrink-0 rounded-xl bg-[#2F6BFF] px-4 py-2.5 text-[14px] font-semibold text-white active:opacity-90">
            {copied ? t("복사됨") : t("링크 복사")}
          </button>
        </div>
      </div>
    </section>
  );
}
