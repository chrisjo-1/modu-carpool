"use client";
import { useState } from "react";
import { dayName } from "@/lib/i18n";
import { priceAllowedRegular } from "@/lib/time";
import { defaultRoleFor, type Place, type Post, type User } from "@/lib/types";
import CarGateSheet from "./CarGate";
import PlaceField from "./PlaceField";
import { Segment, Sheet, api, btnGhost, btnPrimary, field, useLang, useT } from "./ui";

import { TagPicker } from "./Keywords";

/**
 * 비용: 출발 시간으로 자동 설정한다. 평일 출퇴근 시간대(오전 7~9시, 오후 6~8시)면 금액 입력(주황색),
 * 그 밖의 시간이면 무료(초록색). 한 번짜리 등록과 정기카풀이 함께 쓴다.
 */
export function CostField({
  cost,
  price,
  setPrice,
  allowed,
}: {
  cost: "free" | "fixed";
  price: string;
  setPrice: (p: string) => void;
  allowed: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <p className="text-sm text-sub">{t("비용")}</p>
      <div data-block-id="C298" data-block-name="비용 자동 설정" className={`rounded-xl px-4 py-3 text-[15px] font-semibold ${cost === "fixed" ? "bg-warnSoft text-warn" : "bg-[#E6F7EF] text-[#1E7F55]"}`}>
        {t(cost === "fixed" ? "금액 입력 · 자동 설정" : "무료 · 자동 설정")}
      </div>
      {cost === "fixed" && (
        <>
          <label className="block text-sm text-sub">
            {t("희망금액(1회)")}
            <input data-block-id="F024" className={`${field} num mt-1`} inputMode="numeric" required maxLength={6} placeholder={t("예: 3000")} value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </label>
          <p className="text-[14px] leading-relaxed text-warn">{t("영리 목적의 운송은 법으로 금지되어 있습니다.")}</p>
        </>
      )}
      {!allowed && <p className="text-[13px] leading-relaxed text-sub">{t("평일 오전 7~9시, 오후 6~8시에 출발하는 출퇴근 카풀만 금액을 적을 수 있어요.")}</p>}
    </div>
  );
}

/** 출퇴근 정보를 받아 정기카풀로 게시한다. 가입 직후(onboarding)와 수정에 함께 쓴다. */
export default function CommuteSheet({
  user,
  initial,
  prefill,
  onboarding,
  onClose,
  onDone,
  toast,
}: {
  user?: User | null;
  initial: Post | null;
  /** 출발지·도착지를 미리 채운 값(등록 탭에서 먼저 고른 경로) */
  prefill?: { origin: Place; dest: Place };
  onboarding: boolean;
  onClose: () => void;
  onDone: () => void;
  toast: (m: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [role, setRole] = useState<"driver" | "rider">(initial?.role ?? defaultRoleFor(user));
  const [origin, setOrigin] = useState<Place>(prefill?.origin ?? { name: initial?.origin ?? "", lat: initial?.originLat ?? null, lng: initial?.originLng ?? null });
  const [dest, setDest] = useState<Place>(prefill?.dest ?? { name: initial?.dest ?? "", lat: initial?.destLat ?? null, lng: initial?.destLng ?? null });
  const [days, setDays] = useState(initial?.days || "12345");
  const [timeGo, setTimeGo] = useState(initial?.timeGo || "07:30");
  const [back, setBack] = useState(initial ? !!initial.timeBack : true);
  const [timeBack, setTimeBack] = useState(initial?.timeBack || "18:30");
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tagIds ?? []);
  const [busy, setBusy] = useState(false);
  // 운전자 글은 차량번호와 차량 사진이 있어야 올릴 수 있다.
  const [carGate, setCarGate] = useState(false);
  const carOk = !!user?.carNo && !!user?.carPhoto;

  const allowed = priceAllowedRegular(days, timeGo, back ? timeBack : "");
  // 비용은 출발 시간으로 자동 정해진다(시간대 안 = 금액 입력, 밖 = 무료).
  const cost: "free" | "fixed" = allowed ? "fixed" : "free";
  const toggleDay = (i: number) => setDays((d) => (d.includes(String(i)) ? d.replace(String(i), "") : [...d, String(i)].sort().join("")));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "driver" && !carOk) return setCarGate(true);
    setBusy(true);
    const r = await api<{ updated: boolean; credit?: number }>("/api/posts", "PUT", {
      role,
      origin: origin.name,
      dest: dest.name,
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
      days,
      timeGo,
      timeBack: back ? timeBack : "",
      seats: 1,
      cost: cost === "fixed" && !allowed ? "free" : cost,
      price: Number(price),
      note,
      tags,
    });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(t(r.data.updated ? "출퇴근 정보를 고쳤어요." : "정기카풀로 게시했어요.") + (r.data.credit ? ` +${r.data.credit.toLocaleString("ko-KR")} ${t("크레딧")}` : ""));
    onDone();
  };

  return (
    <Sheet title={t("내 출퇴근 정보")} blockId="S060" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {carGate && <CarGateSheet onClose={() => setCarGate(false)} />}
        {onboarding && (
          <div>
            <h2 className="text-2xl font-bold leading-snug">{t("출퇴근 정보를 알려 주세요")}</h2>
            <p className="mt-1 text-[15px] text-sub">{t("입력하면 정기카풀로 바로 게시되어 같은 방향 이웃이 찾을 수 있어요.")}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-sm text-sub">{t("나는")}</p>
          <Segment label={t("역할")} value={role} onChange={setRole} options={[["driver", t("운전자")], ["rider", t("탑승자")]]} accents={{ driver: "accent", rider: "mint" }} />
          <p className="text-[13px] leading-relaxed text-sub">{role === "driver" ? t("운전자: 차량으로 태워 주는 글이에요. 차량 등록이 필요해요.") : t("탑승자: 같이 탈 차를 찾는 글이에요.")}</p>
        </div>
        <PlaceField blockId="F060" label={t("집 (출발지)")} placeholder={t("예: 수원 영통역")} value={origin} onChange={setOrigin} locate toast={toast} />
        <PlaceField blockId="F061" label={t("회사 (도착지)")} placeholder={t("예: 강남역")} value={dest} onChange={setDest} toast={toast} />

        <div className="space-y-1.5">
          <p className="text-sm text-sub">{t("출퇴근 요일")}</p>
          <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={t("출퇴근 요일")}>
            {[1, 2, 3, 4, 5, 6, 0].map((i) => {
              const on = days.includes(String(i));
              return (
                <button key={i} type="button" aria-pressed={on} onClick={() => toggleDay(i)} className={`rounded-xl border text-[15px] ${on ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
                  {dayName(lang, i)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-sub">
            {t("출근 출발 시각")}
            <input data-block-id="F062" className={`${field} num mt-1`} type="time" required value={timeGo} onChange={(e) => setTimeGo(e.target.value)} />
          </label>
          <label className={`block text-sm text-sub ${back ? "" : "opacity-40"}`}>
            {t("퇴근 출발 시각")}
            <input data-block-id="F063" className={`${field} num mt-1`} type="time" required={back} disabled={!back} value={timeBack} onChange={(e) => setTimeBack(e.target.value)} />
          </label>
        </div>
        <label className="flex min-h-[44px] items-center gap-3 text-[15px]">
          <input data-block-id="F064" type="checkbox" className="h-5 w-5 accent-[#2F6BFF]" checked={back} onChange={(e) => setBack(e.target.checked)} />
          {t("퇴근길도 함께")}
        </label>


        <div className="space-y-1.5">
          <p className="text-sm text-sub">{t("비용")}</p>
          <CostField cost={cost} price={price} setPrice={setPrice} allowed={allowed} />
        </div>
        <TagPicker role={role} cost={cost === "fixed" && !allowed ? "free" : cost} value={tags} onChange={setTags} />

        <label className="block text-sm text-sub">
          {t("남길 말 (선택)")}
          <textarea data-block-id="F065" className={`${field} mt-1`} rows={2} maxLength={300} placeholder={t("타는 곳, 짐, 분위기 등을 적어 주세요.")} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="space-y-2">
          <button data-block-id="B060" data-block-name="정기카풀 게시" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : initial ? t("저장") : t("정기카풀로 게시하기")}</button>
          {onboarding && <button type="button" data-block-id="B061" data-block-name="나중에" className={btnGhost} onClick={onClose}>{t("나중에 할게요")}</button>}
        </div>
      </form>
    </Sheet>
  );
}
