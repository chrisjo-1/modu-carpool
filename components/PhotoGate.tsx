"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "@/lib/types";
import { PHOTO_REQUIRED } from "@/lib/photoRequired";
import { shrinkProfile } from "@/lib/profilePhoto";
import { Sheet, api, btnPrimary, useT } from "./ui";

/**
 * 카풀을 올리려는데 프로필 사진이 없을 때: 팝업에서 바로 사진을 올린다(다른 화면으로 가지 않는다).
 * 사진을 저장하면 onSaved가 불려 부모가 등록을 바로 이어서 보낸다.
 */
export default function PhotoGateSheet({ onClose, onSaved, toast }: { onClose: () => void; onSaved: () => void; toast: (m: string) => void }) {
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
      onClose();
      onSaved();
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
        <button type="button" data-block-id="B331" data-block-name="여기서 사진 올리기" disabled={busy} className={`${btnPrimary} w-full`} onClick={() => file.current?.click()}>
          {busy ? t("저장하는 중…") : t("사진 올리고 카풀 게시하기")}
        </button>
        <input ref={file} data-block-id="F331" type="file" accept="image/*" className="hidden" aria-label={t("프로필 사진")} onChange={pick} />
      </div>
    </Sheet>,
    document.body,
  );
}
