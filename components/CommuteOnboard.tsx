"use client";
import { useEffect, useState } from "react";
import { estimate, type FareEstimate } from "@/lib/fare";
import type { Place, User } from "@/lib/types";
import { MAX_PRICE, priceAllowedRegular, toMinutes } from "@/lib/time";
import CarInput from "./CarInput";
import PlaceField from "./PlaceField";
import { Sheet, api, btnPrimary, btnRole, field, useT } from "./ui";

type Kind = "commute" | "other";

/**
 * 가입 직후 출퇴근 정보 입력(필수, 닫을 수 없음).
 * - 출퇴근: 출발지·도착지·출근 시간을 받아 정기카풀로 올린다(요일 등은 나중에 보완).
 *   출근 시간이 정기카풀 시간대(평일 출퇴근 시간대) 안이면 1회 희망 금액을 적고, 밖이면 무료 카풀로 올린다.
 *   운전자로 올리는 경우 차량번호·차량 사진이 없으면 그 자리에서 먼저 등록한다.
 * - 기타: 주요 이동경로만 입력한다(게시하지 않는다).
 */
export default function CommuteOnboard({ user, onDone, toast }: { user: User | null; onDone: (msg: string) => void; toast: (m: string) => void }) {
  const t = useT();
  const empty: Place = { name: "", lat: null, lng: null };
  const [kind, setKind] = useState<Kind | "">("");
  // 운전해요/타고 가요를 먼저 고른다. 탑승자는 차량 등록을 묻지 않는다.
  const [role, setRole] = useState<"driver" | "rider" | "">(user?.rolePref === "driver" || user?.rolePref === "rider" ? user.rolePref : "");
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
  const timeValid = toMinutes(timeGo) >= 0;
  // 정기카풀 시간대 규칙과 같은 기준(서버와 공유): 시간대 안이면 금액을 적고, 밖이면 무료.
  const allowed = kind === "commute" && timeValid && priceAllowedRegular("12345", timeGo, "");
  const driver = role === "driver";
  const carOk = !!user?.carNo && !!user?.carPhoto;
  const needCar = kind === "commute" && driver && !carOk;
  const priceOk = Number(price) >= 500 && Number(price) <= MAX_PRICE;
  const ready = kind !== "" && routeNamed && (kind === "other" || (role !== "" && timeValid && !needCar && (!allowed || priceOk)));
  // 아직 빠진 필수 항목을 버튼 위에 적어 준다(버튼이 왜 안 눌리는지 알 수 있게).
  const missing: string[] = [];
  if (kind === "") missing.push(t("출퇴근 종류"));
  if (kind !== "" && !routeNamed) missing.push(t("출발지·도착지"));
  if (kind === "commute") {
    if (role === "") missing.push(t("운전·탑승 선택"));
    if (!timeValid) missing.push(t("출근 시간"));
    if (allowed && !priceOk) missing.push(t("희망 금액"));
    if (needCar) missing.push(t("차량 등록"));
  }

  const save = async () => {
    setBusy(true);
    const r = await api<{ ok: boolean; posted: boolean; reason?: string; updated?: boolean; free?: boolean; credit?: number }>("/api/commute/onboard", "POST", {
      kind,
      origin: origin.name,
      dest: dest.name,
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
      timeGo,
      price: allowed ? Number(price) : 0,
      role,
    });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    // 고른 역할을 화면의 회원 정보에도 반영(모드 알약 등)
    if (user && role && user.rolePref !== role) window.dispatchEvent(new CustomEvent("moducarpool:user", { detail: { ...user, rolePref: role } }));
    if (kind === "other") return onDone(t("주요 이동경로를 저장했어요."));
    if (!r.data.posted) return onDone(`${t("출퇴근 정보를 저장했어요.")} ${t(r.data.reason ?? "")}`.trim());
    const credit = r.data.credit ? ` +${r.data.credit.toLocaleString("ko-KR")} ${t("크레딧")}` : "";
    const done = r.data.free
      ? t("무료 카풀로 올렸어요. 요일과 복귀 시간은 내 정보에서 나중에 보완해 주세요.")
      : t("정기카풀로 올렸어요. 요일과 복귀 시간은 내 정보에서 나중에 보완해 주세요.");
    onDone(done + credit);
  };

  const pick = (k: Kind) => setKind(k);
  const roleChip = (on: boolean, r: "driver" | "rider") => `min-h-0 rounded-xl border px-4 py-3 text-left text-[15px] font-semibold ${on ? (r === "rider" ? "border-mint bg-mintSoft text-mint" : "border-accent bg-accentSoft text-accent") : "border-line bg-white text-ink"}`;
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
        {kind === "commute" && (
          <div data-block-id="C324" data-block-name="운전·탑승 선택" className="space-y-2">
            <p className="text-sm text-sub">{t("카풀에서 나는")}</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("운전·탑승 선택")}>
              <button type="button" role="radio" aria-checked={role === "driver"} data-block-id="B323" data-block-name="운전해요" className={roleChip(role === "driver", "driver")} onClick={() => setRole("driver")}>{t("운전해요")}</button>
              <button type="button" role="radio" aria-checked={role === "rider"} data-block-id="B324" data-block-name="타고 가요" className={roleChip(role === "rider", "rider")} onClick={() => setRole("rider")}>{t("타고 가요")}</button>
            </div>
            {role === "rider" && <p className="text-[13px] leading-relaxed text-sub">{t("탑승자는 차량 등록 없이 바로 올라가요.")}</p>}
          </div>
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
              <span className="mt-1 block text-[13px] leading-relaxed text-sub">{t("평일 오전 7~9시, 오후 6~8시에 출발하면 금액을 적을 수 있어요.")}</span>
            </label>
            {allowed ? (
              <label data-block-id="F323" className="block text-sm text-sub">
                {t("1회 희망 금액 (원)")}
                <input type="number" inputMode="numeric" min={500} max={MAX_PRICE} step={100} required className={`${field} mt-1`} value={price} placeholder="예: 3000" onChange={(e) => setPrice(e.target.value)} />
                <span className="mt-1 block text-[13px] leading-relaxed text-sub">{t("500원 이상 자유롭게 적어 주세요. 100원 단위로 저장돼요.")}</span>
              </label>
            ) : (
              timeValid && (
                <p data-block-id="C322" data-block-name="무료 카풀 안내" role="note" className="rounded-xl bg-accentSoft px-4 py-3 text-[14px] leading-relaxed text-accent">
                  {t("출근 시간이 출퇴근 시간대 밖이라 무료 카풀로 올라가요. 시간대: 평일 오전 7~9시, 오후 6~8시.")}
                </p>
              )
            )}
            {est && (
              <p data-block-id="C321" data-block-name="택시 기준 참고" className="rounded-xl border border-line px-4 py-3 text-[14px] text-sub">
                {t("택시 기준 참고 (예상)")}: {est.taxi.low.toLocaleString("ko-KR")}~{est.taxi.high.toLocaleString("ko-KR")}원
              </p>
            )}
            {needCar && (
              <div className="space-y-2">
                <p className="text-[14px] leading-relaxed text-accent">{t("운전자로 글을 올리려면 차량번호와 차량 사진을 먼저 등록해야 해요. 아래에서 바로 등록할 수 있어요.")}</p>
                <CarInput user={user} toast={toast} onSaved={(u) => window.dispatchEvent(new CustomEvent("moducarpool:user", { detail: u }))} />
              </div>
            )}
          </>
        )}
        {!ready && missing.length > 0 && <p data-block-id="C323" className="text-[14px] font-medium text-accent">{t("아직 필요한 항목")}: {missing.join(", ")}</p>}
        <button type="button" data-block-id="B322" data-block-name="출퇴근 정보 저장" className={kind === "commute" ? btnRole(role) : btnPrimary} disabled={!ready || busy} onClick={save}>
          {busy ? t("처리 중…") : t("저장하고 시작하기")}
        </button>
      </div>
    </Sheet>
  );
}
