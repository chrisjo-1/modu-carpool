"use client";
import { useEffect, useState } from "react";
import { type Post } from "@/lib/types";
import { Card, Sheet, api, btnGhost, btnPrimary, useT } from "./ui";

/** 홈 상단의 새로고침 버튼 */
export function RefreshButton({ onRefresh }: { onRefresh: () => void }) {
  const t = useT();
  return (
    <button type="button" data-block-id="B216" data-block-name="새로고침" className="w-full rounded-2xl border border-line bg-white py-3 text-[15px] font-semibold text-ink active:opacity-80" onClick={onRefresh}>
      {t("새로고침")}
    </button>
  );
}

/** 하단 메뉴 바로 위, 가운데에 떠 있는 CALL 버튼 (홈 화면에서만 보인다) */
export function FloatingCall({ toast }: { toast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-block-id="B217" data-block-name="CALL" aria-label="CALL" className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-accent px-8 py-3.5 text-[16px] font-bold tracking-wide text-white shadow-card active:opacity-80" onClick={() => setOpen(true)}>
        CALL
      </button>
      {open && <CallSheet onClose={() => setOpen(false)} toast={toast} />}
    </>
  );
}

type Step = "choose" | "pick" | "confirm";

function CallSheet({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>("choose");
  const [mine, setMine] = useState<Post[] | null>(null);
  const [picked, setPicked] = useState<Post | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [cost, setCost] = useState<number>(1000);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ radiusKm: number; cost: number }>("/api/call").then((r) => {
      if (!r.ok) return;
      setRadius(r.data.radiusKm);
      setCost(r.data.cost);
    });
  }, []);

  const pickStep = async () => {
    setStep("pick");
    if (mine) return;
    const r = await api<{ posts: Post[] }>("/api/posts?mine=1");
    if (!r.ok) return toast(t(r.error));
    setMine(r.data.posts.filter((p) => p.status === "open" && p.originLat != null && p.originLng != null));
  };

  const taxi = () => toast(t("택시 호출은 준비 중입니다."));

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    const r = await api<{ notified: number; radiusKm: number }>("/api/call", "POST", { postId: picked.id });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    const who = r.data.notified > 0 ? `${t("운전자")} ${r.data.notified.toLocaleString("ko-KR")}${t("명에게 알림을 보냈어요.")}` : t("반경 안에 알릴 운전자가 없어요.");
    toast(`${who} -${cost.toLocaleString("ko-KR")} ${t("크레딧")}`);
    onClose();
  };

  return (
    <Sheet title="CALL" blockId="S011" onClose={onClose}>
      {step === "choose" && (
        <div className="space-y-3">
          <button type="button" data-block-id="B218" data-block-name="택시 호출" className={btnGhost} onClick={taxi}>{t("택시 호출")}</button>
          <button type="button" data-block-id="B219" data-block-name="주변 호출" className={btnPrimary} onClick={pickStep}>{t("주변 운전자 호출")}</button>
        </div>
      )}
      {step === "pick" && (
        <div className="space-y-3">
          <p className="text-sm text-sub">{t("호출에 쓸 내 카풀 글을 골라 주세요.")}</p>
          {mine === null && <div className="h-20 animate-pulse rounded-2xl bg-white" aria-hidden />}
          {mine?.length === 0 && (
            <div className="space-y-2 rounded-2xl bg-bg p-4">
              <p className="text-[15px] font-semibold">{t("CALL은 등록된 카풀이 있어야 쓸 수 있어요.")}</p>
              <p className="text-[14px] leading-relaxed text-sub">{t("먼저 카풀을 등록해 주세요. 출발지가 있는 열린 글 중 하나를 골라 호출할 수 있어요.")}</p>
            </div>
          )}
          <ul data-block-id="C057" data-block-name="내 글 목록" className="space-y-2">
            {mine?.map((p) => (
              <li key={p.id}>
                <button type="button" data-block-id="B220" data-block-name="호출할 글 고르기" className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-left text-[15px]" onClick={() => { setPicked(p); setStep("confirm"); }}>
                  <span className="block truncate font-semibold">{p.origin} → {p.dest}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={btnGhost} onClick={() => setStep("choose")}>{t("뒤로")}</button>
        </div>
      )}
      {step === "confirm" && picked && (
        <div className="space-y-3">
          <Card className="space-y-1 p-4">
            <p className="font-semibold">{picked.origin} → {picked.dest}</p>
            <p className="text-sm text-sub">
              {radius !== null ? `${t("반경")} ${radius}km ${t("안의 운전자에게 알림을 보냅니다.")}` : t("주변 운전자에게 알림을 보냅니다.")}
            </p>
            <p className="text-sm font-semibold text-warn">{t("CALL은")} {cost.toLocaleString("ko-KR")} {t("크레딧이 차감됩니다.")}</p>
            <p className="text-sm text-sub">{t("이 글은 지금 시간으로 다시 올라갑니다.")}</p>
          </Card>
          <button type="button" data-block-id="B221" data-block-name="호출 보내기" className={btnPrimary} disabled={busy} onClick={send}>{busy ? t("처리 중…") : `${t("호출 보내기")} (${cost.toLocaleString("ko-KR")} ${t("크레딧")})`}</button>
          <button type="button" className={btnGhost} onClick={() => setStep("pick")}>{t("뒤로")}</button>
        </div>
      )}
    </Sheet>
  );
}
