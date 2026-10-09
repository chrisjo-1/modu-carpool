"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./ui";

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
  unsupported: "이 브라우저는 푸시 알림을 지원하지 않아요.",
  disabled: "푸시 알림을 준비 중이에요.",
};
