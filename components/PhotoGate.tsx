"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "@/lib/types";
import { PHOTO_REQUIRED } from "@/lib/photoRequired";
import { shrinkProfile } from "@/lib/profilePhoto";
import { Sheet, api, btnGhost, btnPrimary, useT } from "./ui";

/**
 * 카풀을 올리려는데 프로필 사진이 없을 때: 이 자리에서 사진을 올리거나, 내 정보 프로필로 바로 간다.
 * 사진을 저장하면 닫히고, 다시 [등록]을 눌러야 글이 올라간다(자동으로 두 번 올리지 않게).
 */
export default function PhotoGateSheet({ onClose, onGoProfile, toast }: { onClose: () => void; onGoProfile?: () => void; toast: (m: string) => void }) {
  const t = useT();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (typeof document === "undefined") return null;

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const photo = await shrinkProfile(f);
      const r = await api<{ user: User; credit?: number }>("/api/auth", "PUT", { photo });
      if (!r.ok) return toast(t(r.error));
      window.dispatchEvent(new CustomEvent("moducarpool:user", { detail: r.data.user }));
      toast(t("사진을 등록했어요. 다시 [등록]을 눌러 주세요.") + (r.data.credit ? ` +${r.data.credit.toLocaleString("ko-KR")}` : ""));
      onClose();
    } catch {
      toast(t("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <Sheet title={t("프로필 사진을 먼저 등록해 주세요")} blockId="S331" onClose={onClose}>
      <div className="space-y-4">
        <p data-block-id="C331" className="text-[15px] leading-relaxed">{t(PHOTO_REQUIRED)}</p>
        <div className="flex flex-col gap-2">
          <button type="button" data-block-id="B331" data-block-name="여기서 사진 올리기" disabled={busy} className={btnPrimary} onClick={() => file.current?.click()}>
            {busy ? t("저장하는 중…") : t("여기서 사진 올리기")}
          </button>
          {onGoProfile && (
            <button type="button" data-block-id="B332" data-block-name="프로필로 이동" disabled={busy} className={btnGhost} onClick={() => { onClose(); onGoProfile(); }}>
              {t("내 정보 프로필에서 등록하기")}
            </button>
          )}
        </div>
        <input ref={file} data-block-id="F331" type="file" accept="image/*" className="hidden" aria-label={t("프로필 사진")} onChange={pick} />
      </div>
    </Sheet>,
    document.body,
  );
}
