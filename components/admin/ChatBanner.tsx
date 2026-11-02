"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatBanner } from "@/lib/chatBanner";
import { shrinkImage } from "@/lib/shrinkImage";
import { youtubeId } from "@/lib/youtube";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";
const EMPTY: ChatBanner = { kind: "image", video: "", title: "", desc: "", image: "", link: "", active: true, ad: false };

/** 관리자 > 사이트: 채팅 목록 아래 배너 한 칸. 이미지(누르면 링크) 또는 유튜브 영상(그 자리에서 재생). */
export default function AdminChatBanner() {
  const [b, setB] = useState<ChatBanner>(EMPTY);
  const [videoText, setVideoText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/chat-banner")
      .then((r) => r.json())
      .then((j) => {
        if (j.banner) {
          const cur = { ...EMPTY, ...j.banner } as ChatBanner;
          setB(cur);
          setVideoText(cur.video ? `https://youtu.be/${cur.video}` : "");
        }
        setLoaded(true);
      })
      .catch(() => {
        setMsg("불러오지 못했습니다.");
        setLoaded(true);
      });
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    setMsg("");
    try {
      const blob = await shrinkImage(file);
      const gif = file.type === "image/gif";
      const fd = new FormData();
      fd.append("file", new File([blob], gif ? file.name : "chat-banner.jpg", { type: gif ? "image/gif" : "image/jpeg" }));
      const r = await fetch("/api/admin/mail-images", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) setMsg(j.error ?? "이미지를 올리지 못했습니다.");
      else setB((cur) => ({ ...cur, image: `/api/mail/image/${j.id}` }));
    } catch {
      setMsg("이미지를 읽지 못했어요. 다른 사진으로 해 주세요.");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    const next: ChatBanner = { ...b, video: b.kind === "video" ? youtubeId(videoText) : "" };
    if (b.kind === "video" && !next.video) return setMsg("유튜브 영상 주소를 확인해 주세요(예: https://youtu.be/…).");
    setBusy(true);
    const r = await fetch("/api/admin/chat-banner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ banner: next }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    const saved = { ...EMPTY, ...j.banner } as ChatBanner;
    setB(saved);
    setVideoText(saved.video ? `https://youtu.be/${saved.video}` : "");
    setMsg("채팅 배너를 저장했어요. 다음 접속부터 보여요.");
  };

  if (!loaded) return <p className="text-sub">불러오는 중…</p>;

  const parsed = youtubeId(videoText);
  const kindBtn = (k: "image" | "video", label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={b.kind === k}
      onClick={() => setB({ ...b, kind: k })}
      className={`min-h-0 rounded-xl px-4 py-2 text-[14px] ${b.kind === k ? "bg-accent font-semibold text-white" : "bg-bg text-sub"}`}
    >
      {label}
    </button>
  );

  return (
    <section data-block-id="S470" data-block-name="채팅 배너" className="space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <h2 className="text-[16px] font-bold text-ink">채팅 배너</h2>
        <p className="mt-1 text-[13px] text-sub">채팅 목록 맨 아래에 한 칸을 보여 줘요. 이미지(누르면 링크로 이동)나 유튜브 영상(자리에서 재생) 중 하나를 고르세요.</p>
      </div>
      <div role="radiogroup" aria-label="배너 종류" className="flex gap-2">
        {kindBtn("image", "이미지")}
        {kindBtn("video", "유튜브 영상")}
      </div>

      {b.kind === "image" ? (
        <div className="space-y-2">
          {b.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.image} alt="" className="w-full max-w-md rounded-xl border border-line" />
          ) : (
            <p className="rounded-xl bg-bg px-4 py-6 text-center text-[14px] text-sub">아직 이미지가 없어요</p>
          )}
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="min-h-0 rounded-xl border border-line bg-white px-4 py-2 text-[14px] font-semibold disabled:opacity-50">{busy ? "올리는 중…" : "이미지 올리기"}</button>
            {b.image && <button type="button" disabled={busy} onClick={() => setB((cur) => ({ ...cur, image: "" }))} className="min-h-0 rounded-xl border border-line bg-white px-4 py-2 text-[14px] text-warn disabled:opacity-50">이미지 빼기</button>}
          </div>
          <label className="block space-y-1">
            <span className="text-[14px] font-semibold text-ink">링크 (선택: https 주소 또는 / 로 시작하는 사이트 안 경로)</span>
            <input className={input} maxLength={300} placeholder="https://… 또는 /subway" value={b.link} onChange={(e) => setB({ ...b, link: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-[14px] font-semibold text-ink">유튜브 주소</span>
            <input className={input} maxLength={300} placeholder="https://youtu.be/… 또는 youtube.com/watch?v=…" value={videoText} onChange={(e) => setVideoText(e.target.value)} />
          </label>
          {videoText.trim() && (
            <p className={`text-[13px] ${parsed ? "text-mint" : "text-warn"}`}>
              {parsed ? "영상을 찾았어요. 저장하면 채팅 목록 아래에서 재생돼요." : "영상 주소를 알아볼 수 없어요. 유튜브 주소를 그대로 붙여 넣어 주세요."}
            </p>
          )}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-[14px] font-semibold text-ink">제목 (선택, 한 줄)</span>
        <input className={input} maxLength={40} value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className="text-[14px] font-semibold text-ink">설명 (선택, 두 줄까지 보여요)</span>
        <textarea className={`${input} min-h-[72px] resize-y`} maxLength={120} rows={2} value={b.desc} onChange={(e) => setB({ ...b, desc: e.target.value })} />
        <span className="block text-right text-[12px] text-sub">{b.desc.length}/120</span>
      </label>
      <p className="rounded-xl bg-bg px-4 py-3 text-[13px] text-sub">사진 없이 제목·설명만 적어도 채팅 목록 아래에 한 칸으로 보여요. 사진이나 영상을 함께 쓰면 그 아래에 제목·설명이 붙어요.</p>
      <div className="flex flex-wrap gap-4 text-[14px]">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={b.active} onChange={(e) => setB({ ...b, active: e.target.checked })} />보이기</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={b.ad} onChange={(e) => setB({ ...b, ad: e.target.checked })} />광고 표시</label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={save} className="min-h-0 rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50">저장</button>
        {msg && <span role="status" className="text-[14px] text-sub">{msg}</span>}
      </div>
    </section>
  );
}
