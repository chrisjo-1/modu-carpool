"use client";
import { useState } from "react";
import { api, useT } from "../ui";

export type Posture = "sit" | "stand" | "";

/**
 * 앉았어요 한 번. 같은 방향으로 자리를 받을 수 있는 분 모두에게 푸시를 보내고, 결과와 상관없이 오늘 첫 번째에 적립한다.
 * 성공 피드백(앉았다는 확인)을 바로 보여 준다.
 */
export default function SubwayCall({ hasPlan, posture, onPosture, onSent }: { hasPlan: boolean; posture: Posture; onPosture: (p: Posture) => void; onSent: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<{ sent: number; credit: number } | null>(null);

  const sit = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<{ sent: number; credit: number }>("/api/seat/call", "POST");
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    onPosture("sit");
    setDone({ sent: r.data.sent, credit: r.data.credit });
    onSent();
  };

  if (!hasPlan) return <p className="text-[14px] text-sub">{t("설정에서 지하철 출퇴근 정보를 먼저 등록해 주세요.")}</p>;

  return (
    <div data-block-id="S074" data-block-name="앉았어요" className="space-y-3">
      <button
        type="button"
        data-block-id="B250"
        disabled={busy}
        className="w-full rounded-2xl bg-accent px-4 py-5 text-[18px] font-bold text-white shadow-card transition active:scale-[0.99] disabled:opacity-60"
        onClick={sit}
      >
        {busy ? t("알리는 중…") : t("앉았어요")}
        <span className="mt-1 block text-[13px] font-normal text-white/85">{t("같은 방향으로 자리를 받을 분께 알려요")}</span>
      </button>
      {done && (
        <div role="status" className="space-y-1 rounded-2xl bg-mintSoft px-4 py-3">
          <p className="text-[15px] font-semibold text-mint">{t("앉으셨군요, 축하해요!")}</p>
          <p className="text-[13px] leading-relaxed text-ink">
            {done.sent > 0 ? `${done.sent}${t("명에게 알렸어요. 수락하면 자리와 대화가 열려요.")}` : t("지금은 자리를 받을 분이 없어요. 맞는 분이 생기면 알려 드릴게요.")}
            {done.credit > 0 && <span className="ml-1 font-semibold text-mint">+{done.credit}{t("크레딧 적립")}</span>}
          </p>
          {done.credit === 0 && <p className="text-[12px] text-sub">{t("오늘 앉아가기 크레딧은 이미 받았어요.")}</p>}
        </div>
      )}
      {msg && <p className="text-[14px] leading-relaxed text-ink">{msg}</p>}
    </div>
  );
}
