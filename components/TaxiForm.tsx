"use client";
import { useState } from "react";
import type { Place } from "@/lib/types";
import PlaceField from "./PlaceField";
import { Card, Segment, api, btnPrimary, field, useT } from "./ui";

/** 시각(ms)을 datetime-local 입력 값(기기 현지 시간)으로 */
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 택시 동승 글 올리기. 차량 정보 없이 출발·도착·시각·인원만 받는다.
 * 올리면 출발지 반경 안 회원에게 푸시를 보내고, 출발 30분 뒤 목록에서 빠진다.
 */
export default function TaxiForm({ toast, onDone }: { toast: (m: string) => void; onDone: (id?: string) => void }) {
  const t = useT();
  const empty: Place = { name: "", lat: null, lng: null };
  const [origin, setOrigin] = useState<Place>(empty);
  const [dest, setDest] = useState<Place>(empty);
  const [at, setAt] = useState(() => toLocalInput(Date.now() + 15 * 60_000));
  const [seats, setSeats] = useState<"1" | "2" | "3">("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (origin.lat == null || origin.lng == null) return toast(t("출발지를 목록에서 골라 주세요."));
    if (dest.name.trim().length < 2) return toast(t("도착지를 입력해 주세요."));
    setBusy(true);
    const r = await api<{ id: string; sent: number }>("/api/posts/taxi", "POST", {
      origin: origin.name,
      dest: dest.name,
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
      at: new Date(at).toISOString(),
      seats: Number(seats),
      note,
    });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(r.data.sent ? `${t("택시 동승 글을 올렸어요. 근처 회원 {n}명에게 알렸어요.").replace("{n}", String(r.data.sent))}` : t("택시 동승 글을 올렸어요."));
    onDone(r.data.id);
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-block-id="F330" data-block-name="택시 동승 등록">
      <Card className="space-y-4 p-5">
        <PlaceField blockId="F331" label={t("출발지")} placeholder={t("예: 강남역 2번 출구")} value={origin} onChange={setOrigin} locate toast={toast} />
        <PlaceField blockId="F332" label={t("도착지")} placeholder={t("예: 서울역")} value={dest} onChange={setDest} toast={toast} />
        <label className="block">
          <span className="text-sm text-sub">{t("출발 시각")}</span>
          <input data-block-id="F333" type="datetime-local" required className={`${field} mt-1`} value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <Segment label={t("함께 탈 인원")} value={seats} onChange={setSeats} options={[["1", "1명"], ["2", "2명"], ["3", "3명"]]} />
        <label className="block">
          <span className="text-sm text-sub">{t("한마디 (선택)")}</span>
          <input data-block-id="F334" maxLength={200} className={`${field} mt-1`} placeholder={t("예: 짐 없이 가요")} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="text-[13px] leading-relaxed text-sub">{t("출발 30분 뒤에는 목록에서 자동으로 사라져요. 연락처는 신청을 수락한 뒤에만 보여요.")}</p>
      </Card>
      <button data-block-id="B330" data-block-name="택시 동승 올리기" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : t("택시 동승 올리기")}</button>
    </form>
  );
}
