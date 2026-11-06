"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PushState } from "./Push";
import { pushHint } from "./Push";
import { Sheet, useT } from "./ui";

type PushApi = { state: PushState; turnOn: () => Promise<string> };

/** 알림 권한을 '차단'해 둔 기기에서 다시 허용하는 방법 */
function DeniedGuide() {
  const t = useT();
  const rows: [string, string][] = [
    ["안드로이드 · 크롬", "주소창 왼쪽 자물쇠(또는 설정 아이콘) → 권한 → 알림 → 허용"],
    ["안드로이드 · 삼성 인터넷", "아래 ≡ 메뉴 → 설정 → 사이트 및 다운로드 → 알림 → moducarpool.com 허용"],
    ["홈 화면에 설치한 앱", "휴대폰 설정 → 애플리케이션 → 모두의카풀(또는 Chrome) → 알림 → 허용"],
    ["아이폰", "설정 → 알림 → 모두의카풀 → 알림 허용"],
  ];
  return (
    <div data-block-id="C436" data-block-name="알림 차단 풀기 안내" className="space-y-2 rounded-xl bg-bg p-3">
      <p className="text-[14px] font-semibold text-ink">{t("알림이 차단되어 있어요. 아래 순서로 다시 허용해 주세요.")}</p>
      <ol className="space-y-1.5 text-[13px] text-ink">
        {rows.map(([k, v]) => (
          <li key={k}><span className="font-semibold">{t(k)}</span><br />{t(v)}</li>
        ))}
      </ol>
      <p className="text-[12px] text-sub">{t("허용한 뒤 이 화면을 새로고침하면 알림이 켜져요.")}</p>
    </div>
  );
}

function TurnOn({ push, toast, onDone, compact }: { push: PushApi; toast: (m: string) => void; onDone?: () => void; compact?: boolean }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(!compact);
  if (push.state === "denied")
    return guide ? <DeniedGuide /> : (
      <button type="button" data-block-id="B491" data-block-name="알림 허용 방법 보기" onClick={() => setGuide(true)} className="min-h-[44px] w-full rounded-xl border border-accent bg-white px-4 py-2.5 text-[15px] font-semibold text-accent">{t("알림이 차단되어 있어요 · 허용 방법 보기")}</button>
    );
  if (push.state !== "off") return pushHint[push.state] ? <p className="text-[13px] text-sub">{t(pushHint[push.state] as string)}</p> : null;
  return (
    <button type="button" data-block-id="B490" data-block-name="알림 켜기" disabled={busy} onClick={async () => {
      setBusy(true);
      const err = await push.turnOn();
      setBusy(false);
      if (err) return toast(t(err));
      toast(t("알림을 켰어요."));
      onDone?.();
    }} className="min-h-[44px] w-full rounded-xl bg-accent px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50">{t("알림 켜기")}</button>
  );
}

/**
 * 홈 위 알림 카드(닫기 없음) + 신청·CALL 전에 뜨는 알림 켜기 창.
 * 로그인했는데 이 기기 알림이 켜져 있지 않을 때만 보인다.
 */
export default function PushGate({ push, toast, card }: { push: PushApi; toast: (m: string) => void; card: boolean }) {
  const t = useT();
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const open = () => setSheet(true);
    window.addEventListener("modu:need-push", open);
    return () => window.removeEventListener("modu:need-push", open);
  }, []);
  const show = push.state === "off" || push.state === "denied" || push.state === "ios-install";
  return (
    <>
      {show && card && (
        <section data-block-id="C435" data-block-name="알림 켜기 안내" className="mx-4 mb-2 space-y-2 rounded-2xl border border-accent/30 bg-accentSoft p-3">
          <p className="text-[14px] font-semibold text-ink">🔔 {t("알림을 켜야 카풀 신청과 채팅을 바로 받을 수 있어요.")}</p>
          <TurnOn push={push} toast={toast} compact />
        </section>
      )}
      {sheet && createPortal(
        // 신청 화면·CALL 창(같은 z-50) 위에 뜨도록 body 끝에 따로 붙인다
        <div className="relative z-[60]"><Sheet title={t("알림을 먼저 켜 주세요")} onClose={() => setSheet(false)} blockId="S433">
          <div className="space-y-3">
            <p className="text-[15px] text-ink">{t("상대가 수락하거나 메시지를 보내면 알림으로 알려 드려요. 알림이 꺼져 있으면 답을 놓칠 수 있어 먼저 켜야 보낼 수 있어요.")}</p>
            <TurnOn push={push} toast={toast} onDone={() => { setSheet(false); toast(t("알림을 켰어요. 다시 눌러 보내 주세요.")); }} />
          </div>
        </Sheet></div>,
        document.body,
      )}
    </>
  );
}
