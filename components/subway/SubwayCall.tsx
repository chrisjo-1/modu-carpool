"use client";
import { useState } from "react";
import { api, useT } from "../ui";

export type Posture = "sit" | "stand" | "";

/**
 * ③ 주변에 CALL. 앉아 있으면 양보(sit), 서 있으면 희망(stand)으로 1~3정거장 안 상대 모두에게 요청과 알림을 보낸다.
 * 횟수 제한·크레딧 차감 없음.
 */
export default function SubwayCall({ hasPlan, posture, onSent }: { hasPlan: boolean; posture: Posture; onSent: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const call = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<{ sent: number }>("/api/seat/call", "POST", { posture });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    if (r.data.sent === 0) return setMsg(t("지금은 새로 보낼 상대가 없어요. 맞는 분이 등록하면 알려 드릴게요."));
    setMsg(`${r.data.sent}${t("명에게 보냈어요. 수락하면 대화할 수 있어요.")}`);
    onSent();
  };

  const hint = !posture
    ? t("②에서 앉았는지 서 있는지 먼저 골라 주세요.")
    : posture === "sit"
      ? t("앉아 계시니 1~3정거장 안에서 자리를 받을 분에게 양보 요청을 보내요.")
      : t("서 계시니 1~3정거장 안에서 자리를 양보해 줄 분에게 희망 요청을 보내요.");

  return (
    <div data-block-id="S074" data-block-name="지하철 CALL" className="space-y-3">
      <p className="text-[13px] leading-relaxed text-sub">{hint}</p>
      {hasPlan ? (
        <button
          type="button"
          data-block-id="B250"
          data-block-name="지하철 CALL"
          aria-label="CALL"
          className="w-full rounded-2xl bg-accent py-4 text-[16px] font-semibold tracking-wide text-white shadow-card active:opacity-90 disabled:opacity-40"
          disabled={busy || !posture}
          onClick={call}
        >
          {busy ? t("보내는 중…") : t("주변에 CALL 보내기")}
        </button>
      ) : (
        <p className="text-[14px] text-sub">{t("내 출퇴근 정보 → 지하철에서 먼저 등록해 주세요.")}</p>
      )}
      {msg && <p className="text-[14px] leading-relaxed text-ink">{msg}</p>}
      <p className="text-[12px] text-sub">{t("횟수 제한과 크레딧 차감이 없어요.")}</p>
    </div>
  );
}
