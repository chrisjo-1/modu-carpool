"use client";
import { useState } from "react";
import type { Place } from "@/lib/types";
import PlaceField from "./PlaceField";
import { Sheet, btnGhost, btnPrimary, useT } from "./ui";

/** 나중에 설정하기로 한 회원: 다음에 앱을 열 때 출퇴근 정보를 다시 물어본다(이 기기 기준). */
export const COMMUTE_LATER_KEY = "modu.commuteLater";

/**
 * 등록 탭에서 출퇴근(정기카풀)을 고르면 먼저 출발지·도착지만 묻는다.
 * '기타'를 누르면 지금은 건너뛰고, 다음에 앱을 열 때 출퇴근 정보를 설정하도록 기억해 둔다.
 */
export default function CommuteStart({ onNext, onLater, onClose, toast }: { onNext: (origin: Place, dest: Place) => void; onLater: () => void; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const empty: Place = { name: "", lat: null, lng: null };
  const [origin, setOrigin] = useState<Place>(empty);
  const [dest, setDest] = useState<Place>(empty);
  const ready = origin.name.trim().length >= 2 && dest.name.trim().length >= 2;

  return (
    <Sheet title={t("출퇴근 카풀")} blockId="S301" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold leading-snug">{t("출발지와 도착지를 먼저 알려 주세요")}</h2>
          <p className="mt-1 text-[15px] text-sub">{t("같은 방향으로 가는 이웃을 찾는 데 쓰여요. 다음 화면에서 요일과 시간을 정해요.")}</p>
        </div>
        <PlaceField blockId="F301" label={t("출발지")} placeholder={t("예: 수원 영통역")} value={origin} onChange={setOrigin} locate toast={toast} />
        <PlaceField blockId="F302" label={t("도착지")} placeholder={t("예: 강남역")} value={dest} onChange={setDest} toast={toast} />
        <div className="space-y-2 pt-1">
          <button type="button" data-block-id="B301" data-block-name="출퇴근 다음" className={btnPrimary} disabled={!ready} onClick={() => onNext(origin, dest)}>{t("다음")}</button>
          <button type="button" data-block-id="B302" data-block-name="출퇴근 기타(나중에)" className={btnGhost} onClick={onLater}>{t("기타 (나중에 설정할게요)")}</button>
          <p className="text-center text-[13px] text-sub">{t("기타를 고르면 다음에 앱을 열 때 출퇴근 정보를 물어볼게요.")}</p>
        </div>
      </div>
    </Sheet>
  );
}
