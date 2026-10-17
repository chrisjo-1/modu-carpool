"use client";
import { Sheet, useT } from "../ui";

/**
 * 위치 찾는 법 안내. 사진은 이 시트를 열 때만 불러온다(첫 화면 영향 없음).
 * 사진: 회원이 직접 찍은 승강장 바닥 표시(6-1)와 열차 안 차량 번호(2590).
 */
export default function LocationHelp({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Sheet title={t("위치 찾는 법")} onClose={onClose} blockId="S071">
      <div className="space-y-6 pb-2">
        <section className="space-y-2">
          <p className="text-[15px] font-semibold text-ink">{t("1. 타기 전: 바닥 표시로 만날 곳 찾기")}</p>
          <img src="/subway/floor-marker.webp" alt={t("승강장 바닥의 삼각형 표시 6-1")} width={720} height={541} loading="lazy" decoding="async" className="h-auto w-full rounded-2xl border border-line" />
          <p className="text-[14px] leading-relaxed text-sub">
            {t("승강장 바닥의 삼각형 표시는 '칸-문' 번호예요. 6-1은 6번째 칸의 1번 문이라는 뜻이에요. 매칭된 상대와 같은 번호 앞에서 기다리면 같은 칸에 탈 수 있어요.")}
          </p>
        </section>
        <section className="space-y-2">
          <p className="text-[15px] font-semibold text-ink">{t("2. 탄 뒤: 차량 번호로 같은 칸 확인하기")}</p>
          <img src="/subway/car-number.webp" alt={t("열차 안 문 위의 차량 번호 2590")} width={720} height={540} loading="lazy" decoding="async" className="h-auto w-full rounded-2xl border border-line" />
          <p className="text-[14px] leading-relaxed text-sub">
            {t("열차 안 문 위에 붙은 4자리 숫자가 차량 번호예요. 칸마다 번호가 달라서, 상대와 번호가 같으면 같은 칸이에요. 위 전광판은 지금 역이나 다음 역을 보여 줘요.")}
          </p>
          <p className="text-[12px] leading-relaxed text-sub">{t("차량 번호 확인은 선택이에요. 번호는 같은 칸인지 비교하는 데만 쓰고 하루 뒤 지워요.")}</p>
        </section>
      </div>
    </Sheet>
  );
}
