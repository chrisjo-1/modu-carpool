"use client";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import { api, useT } from "./ui";

type Commute = { origin: string; dest: string; originLat: number | null; originLng: number | null; destLat: number | null; destLng: number | null; timeGo: string; price: number };
type Status = { show: boolean; verified?: boolean; role?: "driver" | "rider" | ""; carOk?: boolean; commute?: Commute | null };

const DISMISS = "modu.nudge";
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/**
 * 홈 맨 위 '아직 내 카풀 글이 없어요' 카드. 진행 중인 글이 없는 회원에게만 보인다.
 * 저장된 출퇴근 정보가 있으면 [바로 올리기]로 정기카풀을 한 번에 올리고, 빠진 항목(이메일 인증·차량 등록)을 알려 준다.
 * 저장된 정보가 없으면 출퇴근 경로 입력 창을 연다. [오늘은 닫기]는 하루 동안 숨긴다.
 */
export default function PostNudge({ user, onCommute, onGoMe, onPosted, toast }: { user: User; onCommute: () => void; onGoMe: () => void; onPosted: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS) === today();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    fetch("/api/commute/onboard")
      .then((r) => r.json())
      .then((j: Status) => alive && setS(j))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id, user.verified, user.carNo, user.carPhoto, hidden]);

  if (hidden || !s?.show) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS, today());
    } catch {
      /* 무시 */
    }
    setHidden(true);
  };

  const post = async (role: "driver" | "rider") => {
    if (!s.commute) return onCommute();
    setBusy(true);
    const r = await api<{ posted: boolean; reason?: string; credit?: number }>("/api/commute/onboard", "POST", { kind: "commute", ...s.commute, role });
    setBusy(false);
    if (!r.ok) {
      toast(t(r.error));
      return onCommute();
    }
    if (!r.data.posted) return toast(t(r.data.reason ?? "아직 올릴 수 없어요."));
    if (user.rolePref !== role) window.dispatchEvent(new CustomEvent("moducarpool:user", { detail: { ...user, rolePref: role } }));
    toast(`${t("정기카풀로 올렸어요.")}${r.data.credit ? ` +${r.data.credit.toLocaleString("ko-KR")} ${t("크레딧")}` : ""}`);
    setS({ show: false });
    onPosted();
  };

  const role = s.role ?? "";
  const needCar = role === "driver" && !s.carOk;
  const missing: string[] = [];
  if (!s.verified) missing.push(t("이메일 인증"));
  if (needCar) missing.push(t("차량 등록"));
  const btn = "min-h-[44px] rounded-xl px-4 text-[15px] font-semibold active:opacity-90 disabled:opacity-50";

  return (
    <section data-block-id="C330" data-block-name="글 올리기 안내" className="mx-5 mb-3 space-y-3 rounded-2xl border border-accent/30 bg-accentSoft px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-ink">{t("아직 내 카풀 글이 없어요")}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-sub">
            {s.commute ? `${s.commute.origin} → ${s.commute.dest} · ${s.commute.timeGo}` : t("출퇴근 경로를 올리면 같은 방향 이웃이 먼저 연락해요.")}
          </p>
        </div>
        <button type="button" data-block-id="B333" className="shrink-0 text-[13px] text-sub underline" onClick={close}>{t("오늘은 닫기")}</button>
      </div>
      {missing.length > 0 && <p className="text-[13px] font-medium text-accent">{t("먼저 필요해요")}: {missing.join(", ")}</p>}
      {!s.verified ? (
        <p className="text-[13px] leading-relaxed text-sub">{t("위의 인증 안내에서 메일을 확인해 주세요. 인증하면 바로 올릴 수 있어요.")}</p>
      ) : !s.commute ? (
        <button type="button" data-block-id="B330" className={`${btn} w-full bg-accent text-white`} onClick={onCommute}>{t("출퇴근 경로 올리기")}</button>
      ) : role === "" ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-block-id="B331" disabled={busy} className={`${btn} bg-accent text-white`} onClick={() => (s.carOk ? post("driver") : onGoMe())}>{t("운전자로 올리기")}</button>
          <button type="button" data-block-id="B332" disabled={busy} className={`${btn} bg-mint text-white`} onClick={() => post("rider")}>{t("탑승자로 올리기")}</button>
        </div>
      ) : needCar ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-block-id="B334" className={`${btn} bg-accent text-white`} onClick={onGoMe}>{t("차량 등록하기")}</button>
          <button type="button" data-block-id="B335" disabled={busy} className={`${btn} bg-mint text-white`} onClick={() => post("rider")}>{t("탑승자로 올리기")}</button>
        </div>
      ) : (
        <button type="button" data-block-id="B336" disabled={busy} className={`${btn} w-full ${role === "rider" ? "bg-mint" : "bg-accent"} text-white`} onClick={() => post(role)}>
          {busy ? t("올리는 중…") : t("바로 올리기")}
        </button>
      )}
    </section>
  );
}
