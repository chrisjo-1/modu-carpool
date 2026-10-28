"use client";
import { useEffect, useRef, useState } from "react";
import type { Banner } from "@/lib/banners";
import { shrinkImage } from "@/lib/shrinkImage";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";
const MAX = 5;
const newBanner = (): Banner => ({ id: Math.random().toString(36).slice(2, 10), title: "", body: "", image: "", link: "", active: true, ad: false, start: "", end: "" });

/** 관리자 > 사이트: 홈 상단 배너 목록. 순서·켜기·기간·광고 표시를 정하고 한 번에 저장한다. */
export default function AdminBanners() {
  const [list, setList] = useState<Banner[]>([]);
  const [saved, setSaved] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 이미지: 휴대폰·PC에서 고른 사진을 가로 1200px로 줄여 올린다(사이트 보안 정책상 외부 이미지 주소는 앱에서 막힘).
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef(-1);
  const [uploading, setUploading] = useState(-1);
  // [수정]을 누른 항목만 입력칸을 펼친다
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const toggle = (id: string, on?: boolean) =>
    setEditing((cur) => {
      const n = new Set(cur);
      if (on ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });
  const pick = (i: number) => {
    target.current = i;
    fileRef.current?.click();
  };
  const upload = async (file: File | undefined) => {
    const i = target.current;
    if (!file || i < 0) return;
    setUploading(i);
    setMsg("");
    try {
      const blob = await shrinkImage(file);
      const gif = file.type === "image/gif";
      const fd = new FormData();
      fd.append("file", new File([blob], gif ? file.name : "banner.jpg", { type: gif ? "image/gif" : "image/jpeg" }));
      const r = await fetch("/api/admin/mail-images", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) setMsg(j.error ?? "이미지를 올리지 못했습니다.");
      else patch(i, { image: `/api/mail/image/${j.id}` });
    } catch {
      setMsg("이미지를 읽지 못했어요. 다른 사진으로 해 주세요.");
    }
    setUploading(-1);
    if (fileRef.current) fileRef.current.value = "";
  };

  useEffect(() => {
    fetch("/api/admin/banners")
      .then((r) => r.json())
      .then((j) => {
        if (!j.banners) return setMsg(j.error ?? "불러오지 못했습니다.");
        setList(j.banners);
        setSaved(JSON.stringify(j.banners));
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  }, []);

  const patch = (i: number, p: Partial<Banner>) => setList((l) => l.map((b, k) => (k === i ? { ...b, ...p } : b)));
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/banners", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ banners: list }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setList(j.banners);
    setSaved(JSON.stringify(j.banners));
    setMsg("저장했어요. 앱을 새로 열면 팝업으로 보여요.");
  };

  const dirty = JSON.stringify(list) !== saved;

  return (
    <section data-block-id="A231" data-block-name="홈 배너" className="max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <p className="text-[15px] font-semibold">홈 배너 (팝업) <span className="font-normal text-sub">{list.length}/{MAX}</span></p>
        <p className="mt-1 text-[13px] leading-relaxed text-sub">앱을 열면 화면 위에 팝업으로 떠요([오늘 하루 보지 않기]·[닫기]). 여러 개면 좌우로 밀거나 정해진 간격(아래 '앱 접속 팝업'의 간격)마다 다음 배너로 넘어가고, 앱 접속 팝업이 있으면 그 뒤에 이어서 나와요. 켜진 것 중 기간 안에 있는 것만 보입니다. 링크는 https 주소나 / 로 시작하는 사이트 안 경로만 쓸 수 있어요.</p>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />

      {list.map((b, i) => (
        <div key={b.id} data-block-id="C233" data-block-name="배너 항목" className="space-y-2.5 rounded-xl border border-line bg-bg p-3">
          <div className="flex items-center gap-3">
            {b.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image} alt="" className="h-12 w-20 shrink-0 rounded-md border border-line bg-white object-cover" />
            ) : (
              <div className="grid h-12 w-20 shrink-0 place-items-center rounded-md border border-dashed border-line bg-white text-[10px] text-sub">글만</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{i + 1}. {b.title || "(제목 없음)"}{b.ad ? " · 광고" : ""}</p>
              <p className="text-[12px] text-sub">{b.active ? "켜짐" : "꺼짐"}{b.start || b.end ? ` · ${b.start || "지금"} ~ ${b.end || "계속"}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-sub underline disabled:opacity-40">위로</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="text-sub underline disabled:opacity-40">아래로</button>
            <button type="button" data-block-id="B408" data-block-name="배너 수정" onClick={() => toggle(b.id)} className="font-semibold text-accent underline">{editing.has(b.id) ? "접기" : "수정"}</button>
            <button type="button" onClick={() => { if (window.confirm("이 배너를 지울까요? [배너 저장]을 눌러야 반영돼요.")) setList((l) => l.filter((_, k) => k !== i)); }} className="text-warn underline">삭제</button>
          </div>
          {editing.has(b.id) && (
            <div className="space-y-2.5 border-t border-line pt-2.5">
          <input data-block-id="F115" aria-label="배너 제목" maxLength={40} className={input} placeholder="제목 (40자 이내)" value={b.title} onChange={(e) => patch(i, { title: e.target.value })} />
          <input data-block-id="F116" aria-label="배너 설명" maxLength={80} className={input} placeholder="설명 (선택, 80자 이내)" value={b.body} onChange={(e) => patch(i, { body: e.target.value })} />
          <div data-block-id="F117" data-block-name="배너 이미지" className="space-y-2">
            {b.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image} alt="" className="max-h-56 w-full rounded-xl border border-line bg-white object-contain" />
            ) : (
              <div className="grid h-20 w-full place-items-center rounded-xl border border-dashed border-line bg-white text-[12px] text-sub">이미지 없음 (선택)</div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" data-block-id="B406" data-block-name="배너 이미지 올리기" onClick={() => pick(i)} disabled={uploading >= 0} className="rounded-lg border border-line bg-white px-3 py-2 text-[14px] disabled:opacity-50">
                {uploading === i ? "올리는 중…" : b.image ? "이미지 바꾸기" : "휴대폰·PC에서 이미지 올리기"}
              </button>
              {b.image && <button type="button" onClick={() => patch(i, { image: "" })} className="text-[14px] text-warn underline">이미지 빼기</button>}
              <span className="text-[12px] text-sub">팝업으로 떠서 세로 사진(예: 3:4)도 잘 맞아요. 1200px로 자동 축소돼요.</span>
            </div>
          </div>
          <input data-block-id="F118" aria-label="링크" className={input} placeholder="링크: https://… 또는 /post 같은 사이트 안 경로 (선택)" value={b.link} onChange={(e) => patch(i, { link: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 text-sm text-sub">
            <label className="block">시작일 (비우면 바로)<input data-block-id="F119" type="date" className={`${input} mt-1`} value={b.start} onChange={(e) => patch(i, { start: e.target.value })} /></label>
            <label className="block">종료일 (비우면 계속)<input data-block-id="F120" type="date" className={`${input} mt-1`} value={b.end} onChange={(e) => patch(i, { end: e.target.value })} /></label>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={b.active} onChange={(e) => patch(i, { active: e.target.checked })} />켜기</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={b.ad} onChange={(e) => patch(i, { ad: e.target.checked })} />광고 표시 (&quot;광고&quot; 글자를 붙여요)</label>
          </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-block-id="B292" onClick={() => { const n = newBanner(); setList((l) => [...l, n]); toggle(n.id, true); }} disabled={list.length >= MAX} className="rounded-xl bg-bg px-4 py-2.5 text-[15px] disabled:opacity-50">배너 추가</button>
        <button type="button" data-block-id="B293" data-block-name="배너 저장" onClick={save} disabled={busy || !dirty} className="rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50">{busy ? "저장 중…" : "배너 저장"}</button>
        {msg && <p className="text-[14px] text-sub">{msg}</p>}
      </div>
    </section>
  );
}
