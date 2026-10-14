"use client";
import { useRef, useState } from "react";
import type { User } from "@/lib/types";
import { api, btnPrimary, field, useT } from "./ui";

/** 사진을 800px 안쪽 JPEG 데이터로 줄인다(서버 한도 안에 맞춘다). */
export async function shrinkCar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  let q = 0.8;
  let out = canvas.toDataURL("image/jpeg", q);
  while (out.length > 290_000 && q > 0.4) out = canvas.toDataURL("image/jpeg", (q -= 0.1));
  return out;
}

/**
 * 운전자 글에 필요한 차량번호·차량 사진을 그 자리에서 등록한다.
 * 저장이 끝나면 바뀐 회원 정보를 onSaved로 알린다.
 */
export default function CarInput({ user, onSaved, toast }: { user: User | null; onSaved: (u: User) => void; toast: (m: string) => void }) {
  const t = useT();
  const [carNo, setCarNo] = useState(user?.carNo ?? "");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const hasPhoto = !!photo || !!user?.carPhoto;

  const save = async () => {
    setBusy(true);
    let latest: User | null = null;
    if (carNo.replace(/\s/g, "") !== (user?.carNo ?? "")) {
      const r = await api<{ user: User }>("/api/auth", "PATCH", { carNo });
      if (!r.ok) { setBusy(false); return toast(t(r.error)); }
      latest = r.data.user;
    }
    if (photo) {
      const r = await api<{ user: User }>("/api/auth", "PUT", { kind: "car", photo });
      if (!r.ok) { setBusy(false); return toast(t(r.error)); }
      latest = r.data.user;
    }
    setBusy(false);
    if (latest) {
      setPhoto("");
      onSaved(latest);
      toast(t("차량을 등록했어요. 이제 글을 올릴 수 있어요."));
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line p-4">
      <p className="text-[15px] font-semibold">{t("운전자 글에 필요한 차량 정보")}</p>
      <input data-block-id="F226" className={field} maxLength={14} placeholder={t("차량번호 (예: 12가3456)")} aria-label={t("차량번호")} value={carNo} onChange={(e) => setCarNo(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-block-id="B227" data-block-name="차량 사진 선택" disabled={busy} className="min-h-0 rounded-xl border border-line bg-white px-4 py-2 text-[15px] font-semibold text-accent" onClick={() => file.current?.click()}>
          {photo || user?.carPhoto ? t("차량 사진 바꾸기") : t("차량 사진 선택")}
        </button>
        <input ref={file} data-block-id="F225" type="file" accept="image/*" className="hidden" aria-label={t("차량 사진")} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            setPhoto(await shrinkCar(f));
          } catch {
            toast(t("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요."));
          }
        }} />
        {hasPhoto && <span className="text-[13px] text-sub">{photo ? t("새 사진 준비됨") : t("등록된 사진 있음")}</span>}
      </div>
      <p className="text-[13px] leading-relaxed text-sub">{t("차량 사진에는 번호판이 보이지 않게 찍어 주세요.")}</p>
      <button type="button" data-block-id="B228" data-block-name="차량 등록하기" className={btnPrimary} disabled={busy || !carNo.trim() || !hasPhoto} onClick={save}>
        {busy ? t("처리 중…") : t("차량 등록하기")}
      </button>
    </div>
  );
}
