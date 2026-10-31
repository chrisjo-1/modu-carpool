"use client";
import { useEffect, useState } from "react";

export type NotifyTarget = { userId?: string | null; warpId?: string; label: string };
type Log = { channel: string; title: string; result: string; at: number };

const input = "w-full rounded-xl border border-line bg-white px-4 py-2.5 text-[15px]";
const CH: Record<string, string> = { push: "푸시", mail: "메일", both: "푸시+메일" };

/**
 * 관리자 → 회원 한 명에게만 푸시·메일(S416). 회원 목록·정기 매칭 후보에서 연다.
 * 앱 계정이 없는 워프 회원은 워프 명단 메일로만 보낸다.
 */
export default function NotifyModal({ target, onClose }: { target: NotifyTarget; onClose: () => void }) {
  const hasApp = !!target.userId;
  const [channel, setChannel] = useState<"push" | "mail" | "both">(hasApp ? "both" : "mail");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [err, setErr] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const key = target.userId ?? `warp:${target.warpId}`;

  useEffect(() => {
    fetch(`/api/admin/notify?target=${encodeURIComponent(key)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.ok) setLog(j.log ?? []);
    });
  }, [key, done]);

  const send = async () => {
    setErr("");
    if (!title.trim() || !msg.trim()) return setErr("제목과 내용을 적어 주세요.");
    setBusy(true);
    const r = await fetch("/api/admin/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: target.userId ?? undefined, warpId: target.userId ? undefined : target.warpId, channel, title, body: msg }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "보내지 못했어요.");
    setDone(j.result);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div data-block-id="S416" data-block-name="회원 1:1 알림" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">이 회원에게만 알림</h3>
        <p className="mt-1 text-sm text-sub">{target.label}{!hasApp && " · 앱 계정 없음(워프 메일로만)"}</p>
        <div className="mt-4 flex gap-2">
          {(["push", "mail", "both"] as const).map((c) => (
            <button key={c} data-block-id="B433" data-block-name="알림 방법" disabled={!hasApp && c !== "mail"}
              className={`min-h-0 flex-1 rounded-full border px-3 py-2 text-sm font-semibold disabled:opacity-40 ${channel === c ? "border-accent bg-accent text-white" : "border-line bg-white text-ink"}`}
              onClick={() => setChannel(c)}>{CH[c]}</button>
          ))}
        </div>
        <input data-block-id="F421" data-block-name="알림 제목" className={`${input} mt-3`} maxLength={60} placeholder="제목 (예: 같은 길 정기카풀 상대가 있어요)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea data-block-id="F422" data-block-name="알림 내용" className={`${input} mt-2 h-32`} maxLength={1000} placeholder="내용 (푸시는 앞 180자만 보여요)" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <p className="mt-1 text-xs text-sub">탈퇴·정지 회원, 수신거부·워프 탈퇴 메일 주소에는 보내지 않아요. 보낸 기록(제목·결과)이 남아요.</p>
        {err && <p className="mt-2 text-sm font-semibold text-warn">{err}</p>}
        {done && <p className="mt-2 rounded-xl bg-accentSoft px-3 py-2 text-sm">{done}</p>}
        <div className="mt-4 flex gap-2">
          <button data-block-id="B434" data-block-name="알림 닫기" className="min-h-0 flex-1 rounded-xl border border-line bg-white py-3 font-semibold" onClick={onClose}>닫기</button>
          <button data-block-id="B435" data-block-name="알림 보내기" disabled={busy} className="min-h-0 flex-1 rounded-xl bg-accent py-3 font-bold text-white disabled:opacity-50" onClick={send}>{busy ? "보내는 중…" : "보내기"}</button>
        </div>
        {log.length > 0 && (
          <div className="mt-5 border-t border-line pt-3">
            <p className="text-sm font-semibold">이 회원에게 보낸 기록</p>
            <ul className="mt-2 space-y-1 text-xs text-sub">
              {log.map((l, i) => (
                <li key={i}>{new Date(l.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {CH[l.channel] ?? l.channel} · {l.title} — {l.result}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
