"use client";
import { useState } from "react";
import { api, useT } from "../ui";

export type Posture = "sit" | "stand" | "";

/**
 * ② 앉았는지 바로 고르기. 두 버튼을 누르면 바로 처리한다(시트 없음).
 * - 앉았어요(파랑): 같은 노선에서 내 자리를 받을 수 있는 상대 모두에게 푸시를 보낸다(횟수 제한 없음).
 * - 못 앉았어요(주황): 푸시 없이 상태만 남긴다.
 */
export default function SubwayCall({ hasPlan, posture, onPosture, onSent }: { hasPlan: boolean; posture: Posture; onPosture: (p: Posture) => void; onSent: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState<"" | "sit" | "stand">("");
  const [msg, setMsg] = useState("");

  const sit = async () => {
    setBusy("sit");
    setMsg("");
    const r = await api<{ sent: number }>("/api/seat/call", "POST");
    setBusy("");
    if (!r.ok) return setMsg(t(r.error));
    onPosture("sit");
    if (r.data.sent === 0) return setMsg(t("지금은 자리를 받을 분이 없어요. 맞는 분이 등록하면 알려 드릴게요."));
    setMsg(`${r.data.sent}${t("명에게 알렸어요. 수락하면 대화할 수 있어요.")}`);
    onSent();
  };

  const stand = () => {
    onPosture("stand");
    setMsg(t("못 앉았어요로 기록했어요. 알림은 보내지 않아요."));
  };

  if (!hasPlan) return <p className="text-[14px] text-sub">{t("설정에서 지하철 출퇴근 정보를 먼저 등록해 주세요.")}</p>;

  return (
    <div data-block-id="S074" data-block-name="앉았는지 고르기" className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          data-block-id="B250"
          aria-pressed={posture === "sit"}
          disabled={busy !== ""}
          className={`rounded-2xl px-3 py-4 text-[16px] font-bold text-white shadow-card transition active:scale-[0.98] disabled:opacity-60 ${posture === "sit" ? "bg-accent ring-4 ring-accent/25" : "bg-accent/90"}`}
          onClick={sit}
        >
          <span className="block">{busy === "sit" ? t("알리는 중…") : t("앉았어요")}</span>
          <span className="mt-0.5 block text-[12px] font-normal text-white/85">{t("자리를 받을 분께 알려요")}</span>
        </button>
        <button
          type="button"
          data-block-id="B252"
          aria-pressed={posture === "stand"}
          disabled={busy !== ""}
          className={`rounded-2xl px-3 py-4 text-[16px] font-bold text-white shadow-card transition active:scale-[0.98] disabled:opacity-60 ${posture === "stand" ? "bg-warn ring-4 ring-warn/25" : "bg-warn/90"}`}
          onClick={stand}
        >
          <span className="block">{t("못 앉았어요")}</span>
          <span className="mt-0.5 block text-[12px] font-normal text-white/85">{t("알림 없이 기록만 해요")}</span>
        </button>
      </div>
      {posture && (
        <p className="text-[13px] text-sub">
          {t("오늘")} · <span className="font-semibold text-ink">{posture === "sit" ? t("앉아 가요") : t("못 앉았어요")}</span>
        </p>
      )}
      {msg && <p className="text-[14px] leading-relaxed text-ink">{msg}</p>}
    </div>
  );
}
