"use client";
import { createPortal } from "react-dom";
import { Sheet, btnPrimary, useT } from "./ui";

/** 운전자 글을 올리려는데 차량이 아직 없을 때 띄우는 안내. 확인을 누르면 닫힌다. */
export default function CarGateSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  if (typeof document === "undefined") return null;
  return createPortal(
    <Sheet title={t("차량을 먼저 등록해 주세요")} blockId="S330" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed">{t("운전자로 글을 올리려면 차량번호와 차량 사진을 등록해야 해요. 사진에는 번호판이 보이지 않게 찍어 주세요.")}</p>
        <ul className="space-y-2 rounded-2xl bg-bg p-4 text-[14px] leading-relaxed text-sub">
          <li>· {t("차량을 등록하면 축하 크레딧 1,000을 드려요.")}</li>
          <li>· {t("운전자로 등록하면 근처 탑승자가 카풀을 올릴 때 푸시 알림을 받을 수 있어요.")}</li>
        </ul>
        <button type="button" onClick={onClose} className={btnPrimary}>{t("확인")}</button>
      </div>
    </Sheet>,
    document.body,
  );
}
