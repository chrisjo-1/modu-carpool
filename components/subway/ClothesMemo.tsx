"use client";
import { useEffect, useState } from "react";
import { api, field, useT } from "../ui";

type Spot = { memo: string; car: string };

/**
 * 착의 메모: 앉은 분이 옷차림을 남긴다(80자). 앉았어요를 누른 뒤에만 보인다.
 * 같은 '오늘의 힌트'에 저장되므로 자리 위치 카드의 힌트와 함께 보인다. 상대에게는 칸이 정해진 뒤 알린다.
 */
export default function ClothesMemo() {
  const t = useT();
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ spot: Spot | null }>("/api/seat/spot").then((r) => {
      const m = r.ok && r.data.spot ? r.data.spot.memo : "";
      setMemo(m);
      setSaved(m);
    });
  }, []);

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<{ spot: Spot | null }>("/api/seat/spot", "PUT", { memoOnly: true, memo });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    const m = r.data.spot?.memo ?? memo;
    setSaved(m);
    setMemo(m);
    setMsg(t("저장했어요."));
  };

  const dirty = memo !== saved;

  return (
    <div data-block-id="C132" data-block-name="착의 메모" className="space-y-2 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">{t("오늘 착의 메모")}</p>
        <span className="text-[12px] text-sub">{t("앉은 분이 남겨 두면 좋아요")}</span>
      </div>
      <textarea
        className={field}
        rows={2}
        maxLength={80}
        placeholder={t("예: 네이비 패딩, 검정 백팩, 노란 모자")}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-[12px] text-sub">{msg || t("매칭된 상대만 볼 수 있어요.")}</p>
        <button type="button" data-block-id="B254" disabled={busy || !dirty} onClick={save} className="shrink-0 rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">
          {busy ? t("저장 중…") : t("저장")}
        </button>
      </div>
    </div>
  );
}
