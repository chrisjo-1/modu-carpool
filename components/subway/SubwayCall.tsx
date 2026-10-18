"use client";
import { useState } from "react";
import { Sheet, api, useT } from "../ui";

/**
 * 지하철 메뉴의 보라색 CALL 버튼(하단 메뉴 바로 위 가운데).
 * 누르면 1~3정거장 안에서 자리를 나눌 수 있는 상대 모두에게 요청과 푸시를 보낸다.
 * 자리 희망·양보는 등록 정보로 자동으로 정해진다. 횟수 제한·크레딧 차감 없음.
 */
export default function SubwayCall({ hasPlan, onSent }: { hasPlan: boolean; onSent: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const call = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<{ sent: number }>("/api/seat/call", "POST");
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    if (r.data.sent === 0) return setMsg(t("지금은 새로 보낼 상대가 없어요. 맞는 분이 등록하면 알려 드릴게요."));
    setMsg(`${r.data.sent}${t("명에게 보냈어요. 수락하면 대화할 수 있어요.")}`);
    onSent();
  };

  return (
    <>
      <button type="button" data-block-id="B250" data-block-name="지하철 CALL" aria-label="CALL" className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 rounded-full bg-violet px-8 py-3.5 text-[16px] font-bold tracking-wide text-white shadow-card active:opacity-80" onClick={() => { setMsg(""); setOpen(true); }}>
        CALL
      </button>
      {open && (
        <Sheet title={t("지하철 CALL")} blockId="S074" onClose={() => setOpen(false)}>
          <div className="space-y-4 pb-2">
            <div className="space-y-2 rounded-2xl bg-violetSoft px-4 py-3">
              <p className="text-[15px] font-semibold text-violet">{t("자리 희망 · 자리 양보")}</p>
              <p className="text-[14px] leading-relaxed text-ink">{t("1~3정거장 안에서 자리를 나눌 수 있는 분 모두에게 요청과 알림을 보내요. 희망(자리 받는 분)과 양보(자리 주시는 분)는 등록 정보로 자동으로 정해져요.")}</p>
            </div>
            {!hasPlan ? (
              <p className="text-[14px] text-sub">{t("내 출퇴근 정보 → 지하철에서 먼저 등록해 주세요.")}</p>
            ) : (
              <button type="button" className="w-full rounded-2xl bg-violet px-5 py-4 text-[17px] font-semibold text-white disabled:opacity-40" disabled={busy} onClick={call}>
                {busy ? t("보내는 중…") : t("CALL 보내기")}
              </button>
            )}
            {msg && <p className="text-[14px] leading-relaxed text-ink">{msg}</p>}
            <p className="text-[12px] text-sub">{t("횟수 제한과 크레딧 차감이 없어요.")}</p>
          </div>
        </Sheet>
      )}
    </>
  );
}
