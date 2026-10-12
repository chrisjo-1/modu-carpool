"use client";
import { useState } from "react";

type Msg = { id: string; from: "reporter" | "target" | "other"; name: string; email: string; body: string; hasImage: boolean; at: number };
type Data = { reason: string; messages: Msg[] };

/** 신고 내역의 '대화 보기' 버튼. 열면 신고된 두 회원 사이 카풀 대화를 보여 준다(열람 기록이 남는다). */
export default function ReportChat({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const show = async () => {
    setOpen(true);
    if (data) return;
    setLoading(true);
    setErr("");
    const r = await fetch(`/api/admin/reports/chat?reportId=${encodeURIComponent(reportId)}`).then(async (x) => ({ ok: x.ok, j: await x.json().catch(() => ({})) }));
    setLoading(false);
    if (!r.ok) return setErr(r.j.error ?? "대화를 불러오지 못했습니다.");
    setData(r.j as Data);
  };

  return (
    <>
      <button type="button" data-block-id="B270" data-block-name="신고 대화 보기" className="mr-3 min-h-0 text-accent underline" onClick={show}>대화 보기</button>
      {open && (
        <div data-block-id="S130" data-block-name="신고 대화 열람" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="font-semibold">신고된 대화</h3>
              <button type="button" data-block-id="B271" data-block-name="대화 닫기" className="min-h-0 text-sub underline" onClick={() => setOpen(false)}>닫기</button>
            </div>
            <div className="space-y-2 px-5 py-3 text-[13px] leading-relaxed text-sub">
              <p>판단 목적으로만 열람하세요. 이 열람은 기록으로 남습니다.</p>
              {data && <p>신고 사유: <span className="text-ink">{data.reason}</span></p>}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-5">
              {loading && <p className="py-6 text-center text-sub">불러오는 중…</p>}
              {err && <p className="py-6 text-center text-warn">{err}</p>}
              {data && data.messages.length === 0 && <p className="py-6 text-center text-sub">주고받은 메시지가 없습니다.</p>}
              {data?.messages.map((m) => (
                <div key={m.id} data-block-id="C270" data-block-name="신고 대화 메시지" className={`rounded-xl px-3 py-2 text-[14px] ${m.from === "reporter" ? "bg-accentSoft" : "bg-bg"}`}>
                  <p className="text-[12px] text-sub">
                    <span className="font-semibold text-ink">{m.name || "-"}</span> · {m.from === "reporter" ? "신고한 회원" : m.from === "target" ? "신고당한 회원" : "기타"} · {new Date(m.at).toLocaleString("ko-KR")}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.body}{m.hasImage && <span className="text-sub"> [사진]</span>}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
