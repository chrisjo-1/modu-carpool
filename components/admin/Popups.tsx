"use client";
import { useEffect, useRef, useState } from "react";
import type { Popup } from "@/lib/popups";
import { shrinkImage } from "@/lib/shrinkImage";

const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";
const MAX = 5;
const newPopup = (): Popup => ({ id: Math.random().toString(36).slice(2, 10), title: "", image: "", link: "", active: true, start: "", end: "" });

/**
 * 관리자 > 사이트: 앱 접속 팝업. 이미지(올리기)·링크·순서·켜기·기간과, 2개 이상일 때 바뀌는 간격(초)을 정해 한 번에 저장한다.
 * 이미지는 사이트 보안 정책상 외부 주소를 쓸 수 없어 여기서 올린다(가로 1200px로 자동 축소).
 */
export default function AdminPopups() {
  const [list, setList] = useState<Popup[]>([]);
  const [interval, setIntervalSec] = useState(4);
  const [saved, setSaved] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
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
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef(-1);

  useEffect(() => {
    fetch("/api/admin/popups")
      .then((r) => r.json())
      .then((j) => {
        if (!Array.isArray(j.items)) return setMsg(j.error ?? "불러오지 못했습니다.");
        setList(j.items);
        setIntervalSec(j.interval || 4);
        setSaved(JSON.stringify({ items: j.items, interval: j.interval || 4 }));
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  }, []);

  const patch = (i: number, p: Partial<Popup>) => setList((l) => l.map((b, k) => (k === i ? { ...b, ...p } : b)));
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
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
      const fd = new FormData();
      fd.append("file", new File([blob], file.type === "image/gif" ? file.name : "popup.jpg", { type: file.type === "image/gif" ? "image/gif" : "image/jpeg" }));
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

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/popups", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: list, interval }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setList(j.items);
    setIntervalSec(j.interval);
    setSaved(JSON.stringify({ items: j.items, interval: j.interval }));
    setMsg("저장했어요. 앱을 새로 열면 보여요.");
  };

  const dirty = JSON.stringify({ items: list, interval }) !== saved;
  const on = list.filter((p) => p.active).length;

  return (
    <section data-block-id="A235" data-block-name="앱 접속 팝업" className="max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <p className="text-[15px] font-semibold">앱 접속 팝업 <span className="font-normal text-sub">{list.length}/{MAX}</span></p>
        <p className="mt-1 text-[13px] leading-relaxed text-sub">
          앱을 열면 첫 화면 뒤에 뜨는 팝업이에요. 켜진 것 중 기간 안에 있는 것만 보이고, 2개 이상이면 아래 간격마다 다음 팝업으로 바뀌어요. 누르면 링크로 이동하고, 회원이 [오늘 하루 보지 않기]를 누르면 그날은 다시 뜨지 않아요.
        </p>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />

      {list.map((p, i) => (
        <div key={p.id} data-block-id="C236" data-block-name="팝업 항목" className="space-y-2.5 rounded-xl border border-line bg-bg p-3">
          <div className="flex items-center gap-3">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="h-14 w-12 shrink-0 rounded-md border border-line bg-white object-cover" />
            ) : (
              <div className="grid h-14 w-12 shrink-0 place-items-center rounded-md border border-dashed border-line bg-white text-[10px] text-sub">없음</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{i + 1}. {p.title || "(이름 없음)"}</p>
              <p className="text-[12px] text-sub">{p.active ? "켜짐" : "꺼짐"}{p.start || p.end ? ` · ${p.start || "지금"} ~ ${p.end || "계속"}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-sub underline disabled:opacity-40">위로</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="text-sub underline disabled:opacity-40">아래로</button>
            <button type="button" data-block-id="B407" data-block-name="팝업 수정" onClick={() => toggle(p.id)} className="font-semibold text-accent underline">{editing.has(p.id) ? "접기" : "수정"}</button>
            <button type="button" onClick={() => { if (window.confirm("이 팝업을 지울까요? [팝업 저장]을 눌러야 반영돼요.")) setList((l) => l.filter((_, k) => k !== i)); }} className="text-warn underline">삭제</button>
          </div>
          {editing.has(p.id) && (
            <div className="space-y-2.5 border-t border-line pt-2.5">
          <div className="flex items-start gap-3">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="h-28 w-24 shrink-0 rounded-lg border border-line bg-white object-cover" />
            ) : (
              <div className="grid h-28 w-24 shrink-0 place-items-center rounded-lg border border-dashed border-line bg-white text-[12px] text-sub">이미지 없음</div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <button type="button" data-block-id="B295" onClick={() => pick(i)} disabled={uploading >= 0} className="rounded-lg border border-line bg-white px-3 py-2 text-[14px] disabled:opacity-50">
                {uploading === i ? "올리는 중…" : p.image ? "이미지 바꾸기" : "이미지 올리기"}
              </button>
              <p className="text-[12px] leading-relaxed text-sub">세로로 긴 사진(예: 3:4)이 보기 좋아요. 1200px로 자동 축소돼요.</p>
            </div>
          </div>
          <input data-block-id="F125" aria-label="팝업 이름" maxLength={40} className={input} placeholder="팝업 이름 (관리용·이미지 설명, 40자 이내)" value={p.title} onChange={(e) => patch(i, { title: e.target.value })} />
          <input data-block-id="F126" aria-label="링크" className={input} placeholder="누르면 이동: https://… 또는 /faq 같은 사이트 안 경로 (선택)" value={p.link} onChange={(e) => patch(i, { link: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 text-sm text-sub">
            <label className="block">시작일 (비우면 바로)<input type="date" className={`${input} mt-1`} value={p.start} onChange={(e) => patch(i, { start: e.target.value })} /></label>
            <label className="block">종료일 (비우면 계속)<input type="date" className={`${input} mt-1`} value={p.end} onChange={(e) => patch(i, { end: e.target.value })} /></label>
          </div>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={p.active} onChange={(e) => patch(i, { active: e.target.checked })} />켜기</label>
            </div>
          )}
        </div>
      ))}

      <label className="flex flex-wrap items-center gap-2 text-[15px]">
        바뀌는 간격
        <input data-block-id="F127" type="number" min={2} max={30} className="w-20 rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent" value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))} />
        초
        <span className="text-[13px] text-sub">(켜진 팝업 {on}개{on < 2 ? " · 2개 이상일 때만 바뀌어요" : ""})</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-block-id="B296" onClick={() => { const n = newPopup(); setList((l) => [...l, n]); toggle(n.id, true); }} disabled={list.length >= MAX} className="rounded-xl bg-bg px-4 py-2.5 text-[15px] disabled:opacity-50">팝업 추가</button>
        <button type="button" data-block-id="B297" data-block-name="팝업 저장" onClick={save} disabled={busy || !dirty} className="rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50">{busy ? "저장 중…" : "팝업 저장"}</button>
        {msg && <p className="text-[14px] text-sub">{msg}</p>}
      </div>
    </section>
  );
}
