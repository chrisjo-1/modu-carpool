"use client";
import { useEffect, useState } from "react";

type F = {
  new_total: number; new_posted: number; new_saved_only: number; new_nothing: number;
  warp_total: number; warp_posted: number; saved_no_photo: number;
  pending: number; unverified: number; pendingDays: number;
};

const n = (v: number | undefined) => (v ?? 0).toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

/** 관리자 현황 아래 '가입 → 첫 글' 카드: 신규·워프를 나눠 글 작성 비율과 막힌 지점, 인증 메일 다시 보내기. */
export default function Funnel() {
  const [f, setF] = useState<F | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch("/api/admin/funnel")
      .then((r) => r.json())
      .then((j) => !j.error && setF(j as F))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const resend = async () => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 200 }) })
      .then((x) => x.json())
      .catch(() => ({ error: "보내지 못했어요." }));
    setBusy(false);
    setMsg(r.error ? r.error : `인증 메일 ${n(r.sent)}통 보냄${r.failed ? ` · 실패 ${n(r.failed)}` : ""}`);
    load();
  };

  if (!f) return null;
  const waiting = f.pending + f.unverified;
  const cell = "rounded-xl bg-bg px-3 py-2";
  return (
    <section data-block-id="S092" data-block-name="가입에서 첫 글까지" className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-card">
      <p className="text-sm font-semibold text-ink">가입 → 첫 글</p>
      <div className="grid grid-cols-2 gap-2 text-[13px] md:grid-cols-4">
        <div className={cell}>
          <p className="text-sub">신규 가입</p>
          <p className="num text-lg font-bold">{n(f.new_total)}명</p>
          <p className="num text-sub">글 작성 {n(f.new_posted)} ({pct(f.new_posted, f.new_total)})</p>
        </div>
        <div className={cell}>
          <p className="text-sub">출퇴근만 저장(글 없음)</p>
          <p className="num text-lg font-bold">{n(f.new_saved_only)}명</p>
          <p className="num text-sub">사진 없음 {n(f.saved_no_photo)} · 홈 카드로 바로 올리기 안내</p>
        </div>
        <div className={cell}>
          <p className="text-sub">아무것도 없음</p>
          <p className="num text-lg font-bold">{n(f.new_nothing)}명</p>
          <p className="text-sub">출퇴근 정보도 글도 없음</p>
        </div>
        <div className={cell}>
          <p className="text-sub">워프 연결 회원</p>
          <p className="num text-lg font-bold">{n(f.warp_total)}명</p>
          <p className="num text-sub">글 작성 {n(f.warp_posted)} ({pct(f.warp_posted, f.warp_total)})</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
        <p className="num text-sub">
          인증 대기 <b className="text-ink">{n(waiting)}명</b> · 가입 신청만 하고 인증 안 함 {n(f.pending)}(최근 {f.pendingDays}일) · 인증 안 된 계정 {n(f.unverified)}
        </p>
        <button type="button" data-block-id="B092" disabled={busy || waiting === 0} onClick={resend} className="rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? "보내는 중…" : "인증 메일 다시 보내기"}
        </button>
      </div>
      {msg && <p className="text-[13px] text-accent">{msg}</p>}
      <p className="text-[12px] text-sub">한 번에 최대 200명, 같은 사람에게는 하루 한 번만 보냅니다. 새 링크는 72시간 동안 유효합니다.</p>
    </section>
  );
}
