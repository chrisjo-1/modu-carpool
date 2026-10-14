"use client";
import { useEffect, useState } from "react";
import { estimate, type FareEstimate } from "@/lib/fare";
import type { Place } from "@/lib/types";
import { MAX_PRICE } from "@/lib/time";
import PlaceField from "./PlaceField";
import { Sheet, api, btnPrimary, field, useT } from "./ui";

type Kind = "commute" | "other";

/**
 * 가입 직후 출퇴근 정보 입력(필수, 닫을 수 없음).
 * 출퇴근이면 출발지·도착지·출근 시간·1회 희망 금액을 받아 정기카풀로 올린다(요일 등은 나중에 보완).
 * 출퇴근이 아니면 '기타'를 고르고 주요 이동경로만 입력한다.
 */
export default function CommuteOnboard({ onDone, toast }: { onDone: (msg: string) => void; toast: (m: string) => void }) {
  const t = useT();
  const empty: Place = { name: "", lat: null, lng: null };
  const [kind, setKind] = useState<Kind | "">("");
  const [origin, setOrigin] = useState<Place>(empty);
  const [dest, setDest] = useState<Place>(empty);
  const [timeGo, setTimeGo] = useState("08:00");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [est, setEst] = useState<FareEstimate | null>(null);

  const routeOk = origin.lat != null && origin.lng != null && dest.lat != null && dest.lng != null;
  // 택시 기준 요금은 참고용이다. 금액을 막지 않는다.
  useEffect(() => {
    if (!routeOk) return setEst(null);
    let alive = true;
    fetch(`/api/route?olat=${origin.lat}&olng=${origin.lng}&dlat=${dest.lat}&dlng=${dest.lng}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.meters > 0) setEst(estimate(j.meters, j.seconds, Date.now()));
      })
      .catch(() => alive && setEst(null));
    return () => {
      alive = false;
    };
  }, [routeOk, origin.lat, origin.lng, dest.lat, dest.lng]);

  const routeNamed = origin.name.trim().length >= 2 && dest.name.trim().length >= 2;
  const ready = kind !== "" && routeNamed && (kind === "other" || (/^\d{2}:\d{2}$/.test(timeGo) && Number(price) >= 500 && Number(price) <= MAX_PRICE));

  const save = async () => {
    setBusy(true);
    const r = await api<{ ok: boolean; posted: boolean; reason?: string; updated?: boolean; credit?: number }>("/api/commute/onboard", "POST", {
      kind,
      origin: origin.name,
      dest: dest.name,
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
      timeGo,
      price: Number(price),
    });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    if (kind === "other") return onDone(t("주요 이동경로를 저장했어요."));
    if (!r.data.posted) return onDone(`${t("출퇴근 정보를 저장했어요.")} ${t(r.data.reason ?? "")}`.trim());
    const credit = r.data.credit ? ` +${r.data.credit.toLocaleString("ko-KR")} ${t("크레딧")}` : "";
    onDone(t("정기카풀로 올렸어요. 요일과 복귀 시간은 내 정보에서 나중에 보완해 주세요.") + credit);
  };

  const pick = (k: Kind) => setKind(k);
  const chip = (on: boolean) => `min-h-0 rounded-xl border px-4 py-3 text-left text-[15px] font-semibold ${on ? "border-accent bg-accentSoft text-accent" : "border-line bg-white text-ink"}`;

  return (
    <Sheet title={t("내 출퇴근 정보")} blockId="S310" onClose={() => {}} locked>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold leading-snug">{t("출퇴근 정보를 알려 주세요")}</h2>
          <p className="mt-1 text-[15px] text-sub">{t("가입 때 입력한 경로는 정기카풀로 바로 올라가요. 요일 등은 나중에 내 정보에서 보완할 수 있어요.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-block-id="B320" data-block-name="출퇴근 선택" aria-pressed={kind === "commute"} className={chip(kind === "commute")} onClick={() => pick("commute")}>{t("직장인·출퇴근해요")}</button>
          <button type="button" data-block-id="B321" data-block-name="기타 선택" aria-pressed={kind === "other"} className={chip(kind === "other")} onClick={() => pick("other")}>{t("출퇴근 안 해요 (기타)")}</button>
        </div>
        {kind === "other" && (
          <p data-block-id="C320" data-block-name="주요 이동경로 권고" role="note" className="rounded-xl bg-accentSoft px-4 py-3 text-[14px] leading-relaxed text-accent">
            {t("출퇴근이 아니어도 자주 가는 주요 이동경로를 입력해 주세요. 입력한 경로로 같은 방향 이웃을 찾아 드려요.")}
          </p>
        )}
        {kind !== "" && (
          <>
            <PlaceField blockId="F320" label={kind === "commute" ? t("출퇴근 출발지") : t("주요 이동경로 출발지")} placeholder={t("예: 수원 영통역")} value={origin} onChange={setOrigin} locate toast={toast} />
            <PlaceField blockId="F321" label={kind === "commute" ? t("출퇴근 도착지") : t("주요 이동경로 도착지")} placeholder={t("예: 강남역")} value={dest} onChange={setDest} toast={toast} />
          </>
        )}
        {kind === "commute" && (
          <>
            <label data-block-id="F322" className="block text-sm text-sub">
              {t("출근 시간")}
              <input type="time" required className={`${field} mt-1`} value={timeGo} onChange={(e) => setTimeGo(e.target.value)} />
            </label>
            <label data-block-id="F323" className="block text-sm text-sub">
              {t("1회 희망 금액 (원)")}
              <input type="number" inputMode="numeric" min={500} max={MAX_PRICE} step={100} required className={`${field} mt-1`} value={price} placeholder="예: 3000" onChange={(e) => setPrice(e.target.value)} />
              <span className="mt-1 block text-[13px] leading-relaxed text-sub">{t("500원 이상 자유롭게 적어 주세요. 100원 단위로 저장돼요.")}</span>
            </label>
            {est && (
              <p data-block-id="C321" data-block-name="택시 기준 참고" className="rounded-xl border border-line px-4 py-3 text-[14px] text-sub">
                {t("택시 기준 참고 (예상)")}: {est.taxi.low.toLocaleString("ko-KR")}~{est.taxi.high.toLocaleString("ko-KR")}원
              </p>
            )}
          </>
        )}
        <button type="button" data-block-id="B322" data-block-name="출퇴근 정보 저장" className={btnPrimary} disabled={!ready || busy} onClick={save}>
          {busy ? t("처리 중…") : t("저장하고 시작하기")}
        </button>
      </div>
    </Sheet>
  );
}
