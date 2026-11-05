"use client";
import { useCallback, useEffect, useState } from "react";

type State = {
  cfg: { on?: boolean; mailAfter?: string };
  mailPaused: string;
  total: number; posted: number; ready: number; geo_wait: number; skipped: number; mailed: number; mail_wait: number;
  bounce: { sent: number; bounced: number; rate: number | null };
};

const when = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** 정기 매칭 일괄 게시·안내 메일 진행 상황(lib/poolJob.ts). */
export default function PoolJob() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/pool-job");
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string) => {
    setBusy(true);
    const r = await fetch("/api/admin/pool-job", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(false);
    if (r.ok) setS(await r.json());
  };
  if (!s) return null;
  const on = !!s.cfg.on;
  return (
    <div data-block-id="C440" data-block-name="정기 매칭 일괄 게시" className={`rounded-2xl border p-4 text-sm ${on ? "border-accent bg-accentSoft" : "border-line bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">일괄 게시 · 안내 메일 {on ? "· 진행 중" : "· 멈춤"}</p>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="min-h-0 rounded-lg border border-line bg-white px-3 py-1.5">새로고침</button>
          <button type="button" data-block-id="B472" data-block-name="일괄 게시 켜고 끄기" disabled={busy} onClick={() => act(on ? "off" : "on")} className={`min-h-0 rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50 ${on ? "border border-warn bg-white text-warn" : "bg-accent text-white"}`}>{on ? "멈추기" : "다시 켜기"}</button>
        </div>
      </div>
      <p className="mt-1 text-sub">사이트 접속이 있을 때 3분마다: 위치·이메일이 있는 글 40건씩 정기카풀로 올리고(무료), 올릴 글이 없으면 위치를 채워요. 홈에서는 실제 회원 글 뒤에 보여요.</p>
      <p className="mt-2">올림 <b>{s.posted.toLocaleString("ko-KR")}</b> / 전체 {s.total.toLocaleString("ko-KR")} · 바로 올릴 수 있음 {s.ready.toLocaleString("ko-KR")} · 위치 대기 {s.geo_wait.toLocaleString("ko-KR")} · 올리지 못함(주소·계정 문제) {s.skipped.toLocaleString("ko-KR")}</p>
      <p className="mt-1">안내 메일: {when(s.cfg.mailAfter)}부터 오전 9시~오후 8시, 한 시간 최대 300통 · 보냄 <b>{s.mailed.toLocaleString("ko-KR")}</b> · 남음 {s.mail_wait.toLocaleString("ko-KR")}</p>
      <p className="mt-0.5 text-sub">최근 24시간 반송률: {s.bounce.rate === null ? `판단 전(보낸 ${s.bounce.sent}통, 200통부터)` : `${(s.bounce.rate * 100).toFixed(1)}% (보낸 ${s.bounce.sent}통 중 ${s.bounce.bounced}통)`} · 4%를 넘으면 메일만 멈춰요.</p>
      {s.mailPaused && (
        <div className="mt-2 rounded-lg border border-warn bg-white p-2">
          <p className="font-semibold text-warn">{s.mailPaused}</p>
          <button type="button" data-block-id="B473" data-block-name="안내 메일 다시 켜기" disabled={busy} onClick={() => act("resumeMail")} className="mt-1 min-h-0 rounded-lg border border-line bg-white px-3 py-1.5">메일 다시 켜기</button>
        </div>
      )}
    </div>
  );
}
