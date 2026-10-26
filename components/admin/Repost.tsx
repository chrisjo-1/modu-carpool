"use client";
import { useEffect, useState } from "react";

type Data = { on: boolean; preview: { targets: number; with_push: number }; recent: { day: string; n: number; pushed: number }[]; cron: boolean };

/** 관리자: 다시 올리기 버튼·하루 전 알림 정책 적용(가동)·중지 */
export default function AdminRepost() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/admin/repost").then((r) => r.json()).then((j) => (j.error ? setMsg(j.error) : setD(j))).catch(() => setMsg("불러오지 못했습니다."));
  useEffect(() => {
    load();
  }, []);
  const set = async (on: boolean) => {
    if (!window.confirm(on ? "다시 올리기 버튼과 하루 전 알림을 지금부터 가동할까요?" : "다시 올리기 버튼과 하루 전 알림을 멈출까요?")) return;
    setBusy(true);
    const r = await fetch("/api/admin/repost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? (on ? "정책을 적용했습니다. 오늘 저녁 8시부터 알림이 나갑니다." : "멈췄습니다.") : j.error ?? "저장하지 못했습니다.");
    load();
  };
  return (
    <section data-block-id="S403" data-block-name="다시 올리기·하루 전 알림" className="mt-4 space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            다시 올리기 · 하루 전 알림{" "}
            {d && <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${d.on ? "bg-accentSoft text-accent" : "bg-line text-sub"}`}>{d.on ? "가동 중" : "꺼짐"}</span>}
          </h2>
          <p className="mt-1 text-sm text-sub">회원이 올렸던 1회 카풀을 같은 요일·시간으로 한 번에 다시 올리는 버튼과, 전날 저녁 8시 푸시 알림입니다. 정책을 적용하기 전에는 회원 화면에 버튼이 보이지 않고 알림도 나가지 않습니다.</p>
        </div>
        {d && (d.on ? (
          <button data-block-id="B404" disabled={busy} onClick={() => set(false)} className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink">중지</button>
        ) : (
          <button data-block-id="B405" disabled={busy} onClick={() => set(true)} className="rounded-xl bg-accent px-4 py-2.5 text-[15px] font-semibold text-white">정책 적용 (가동)</button>
        ))}
      </div>
      {d && (
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <p className="rounded-xl bg-bg px-3 py-2">내일 알림 대상 <b className="num">{d.preview.targets.toLocaleString("ko-KR")}명</b> <span className="text-sub">(푸시 받는 기기 있음 {d.preview.with_push.toLocaleString("ko-KR")}명)</span></p>
          <p className="rounded-xl bg-bg px-3 py-2">최근 발송 {d.recent.length ? d.recent.slice(0, 3).map((r) => `${r.day.slice(5)} ${r.pushed}명`).join(" · ") : "없음"}</p>
          <p className="rounded-xl bg-bg px-3 py-2">{d.cron ? "저녁 8시 정시 실행 준비됨" : "CRON_SECRET 없음 → 8시 이후 첫 접속 때 실행"}</p>
        </div>
      )}
      {msg && <p className="text-sm text-sub">{msg}</p>}
    </section>
  );
}
