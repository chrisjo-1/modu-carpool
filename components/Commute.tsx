"use client";
import { useState } from "react";
import { dayName } from "@/lib/i18n";
import { priceAllowedRegular } from "@/lib/time";
import type { Place, Post } from "@/lib/types";
import PlaceField from "./PlaceField";
import { Segment, Sheet, api, btnGhost, btnPrimary, field, useLang, useT } from "./ui";

/** 비용 선택: 무료 / 미터기 나눔 / 금액 입력(허용될 때만). 한 번짜리 등록과 정기카풀이 함께 쓴다. */
export function CostField({
  cost,
  setCost,
  price,
  setPrice,
  allowed,
}: {
  cost: "free" | "meter" | "fixed";
  setCost: (c: "free" | "meter" | "fixed") => void;
  price: string;
  setPrice: (p: string) => void;
  allowed: boolean;
}) {
  const t = useT();
  const shown = cost === "fixed" && !allowed ? "free" : cost;
  const options: ["free" | "meter" | "fixed", string][] = [["free", t("무료")], ["meter", t("미터기로 비용 나눔")]];
  if (allowed) options.push(["fixed", t("금액 입력")]);
  return (
    <div className="space-y-3">
      <Segment label={t("비용")} value={shown} onChange={setCost} options={options} />
      {shown === "fixed" && (
        <>
          <label className="block text-sm text-sub">
            {t("1인 금액 (원)")}
            <input data-block-id="F024" className={`${field} num mt-1`} inputMode="numeric" required maxLength={6} placeholder={t("예: 3000")} value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </label>
          <p className="text-[14px] leading-relaxed text-warn">{t("금액은 기름값·통행료 같은 실비를 나누는 범위에서 정해 주세요. 영리 목적의 운송은 법으로 금지되어 있습니다.")}</p>
        </>
      )}
      {shown === "meter" && <p className="text-[14px] leading-relaxed text-warn">{t("비용 나눔은 평일 출퇴근 시간대(오전 7~9시, 오후 6~8시) 카풀에서 실비를 나누는 경우에만 허용됩니다.")}</p>}
      {!allowed && <p className="text-[13px] leading-relaxed text-sub">{t("평일 오전 7~9시, 오후 6~8시에 출발하는 출퇴근 카풀만 금액을 적을 수 있어요.")}</p>}
    </div>
  );
}

/** 출퇴근 정보를 받아 정기카풀로 게시한다. 가입 직후(onboarding)와 수정에 함께 쓴다. */
export default function CommuteSheet({
  initial,
  onboarding,
  onClose,
  onDone,
  toast,
}: {
  initial: Post | null;
  onboarding: boolean;
  onClose: () => void;
  onDone: () => void;
  toast: (m: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [role, setRole] = useState<"driver" | "rider">(initial?.role ?? "driver");
  const [origin, setOrigin] = useState<Place>({ name: initial?.origin ?? "", lat: initial?.originLat ?? null, lng: initial?.originLng ?? null });
  const [dest, setDest] = useState<Place>({ name: initial?.dest ?? "", lat: initial?.destLat ?? null, lng: initial?.destLng ?? null });
  const [days, setDays] = useState(initial?.days || "12345");
  const [timeGo, setTimeGo] = useState(initial?.timeGo || "07:30");
  const [back, setBack] = useState(initial ? !!initial.timeBack : true);
  const [timeBack, setTimeBack] = useState(initial?.timeBack || "18:30");
  const [seats, setSeats] = useState(initial?.seats ?? 2);
  const [cost, setCost] = useState<"free" | "meter" | "fixed">(initial?.cost ?? "free");
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);

  const allowed = priceAllowedRegular(days, timeGo, back ? timeBack : "");
  const toggleDay = (i: number) => setDays((d) => (d.includes(String(i)) ? d.replace(String(i), "") : [...d, String(i)].sort().join("")));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      seats,
      cost: cost === "fixed" && !allowed ? "free" : cost,
      price: Number(price),
      note,
    });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(t(r.data.updated ? "출퇴근 정보를 고쳤어요." : "정기카풀로 게시했어요.") + (r.data.credit ? ` +${r.data.credit.toLocaleString("ko-KR")} ${t("크레딧")}` : ""));
    onDone();
  };

  return (
    <Sheet title={t("내 출퇴근 정보")} blockId="S060" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {onboarding && (
          <div>
            <h2 className="text-2xl font-bold leading-snug">{t("출퇴근 정보를 알려 주세요")}</h2>
            <p className="mt-1 text-[15px] text-sub">{t("입력하면 정기카풀로 바로 게시되어 같은 방향 이웃이 찾을 수 있어요.")}</p>
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-sm text-sub">{t("나는")}</p>
          <Segment label={t("역할")} value={role} onChange={setRole} options={[["driver", t("운전자")], ["rider", t("탑승자")]]} />
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

        <div className="flex items-center justify-between">
          <p className="text-sm text-sub">{role === "driver" ? t("태울 수 있는 자리") : t("함께 탈 인원")}</p>
          <div className="flex items-center gap-3">
            <button type="button" aria-label={t("줄이기")} className="grid h-11 w-11 place-items-center rounded-full bg-bg text-xl" onClick={() => setSeats((s) => Math.max(1, s - 1))}>−</button>
            <span className="num w-6 text-center text-xl font-bold">{seats}</span>
            <button type="button" aria-label={t("늘리기")} className="grid h-11 w-11 place-items-center rounded-full bg-bg text-xl" onClick={() => setSeats((s) => Math.min(6, s + 1))}>+</button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm text-sub">{t("비용")}</p>
          <CostField cost={cost} setCost={setCost} price={price} setPrice={setPrice} allowed={allowed} />
        </div>

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
