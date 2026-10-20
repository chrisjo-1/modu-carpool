"use client";
import { useEffect, useRef, useState } from "react";
import { carNumbersOf, type LineId } from "@/lib/subway";
import { api, field, useT } from "../ui";
import SeatMap from "./SeatMap";
import { spotText } from "./SubwayMatches";

type Spot = { car: string; door: string; side: "left" | "right" | ""; seat: string; memo: string; photo?: boolean };

/** 힌트 사진을 600px 이하 JPEG로 줄인다(서버 상한 약 220KB). */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  let max = 600;
  let q = 0.72;
  for (let i = 0; i < 4; i++) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", q);
    if (url.length < 290_000) return url;
    max = Math.round(max * 0.8);
    q = Math.max(0.45, q - 0.1);
  }
  throw new Error("too large");
}

/**
 * 오늘 앉은 자리: 칸을 고르고 차량 그림에서 좌석을 누른다. 오늘의 힌트(옷 색깔·소지품)를 함께 남긴다.
 * 수락된 상대에게만 보이고, 저장하면 상대에게 알린다. 하루만 쓰고 다음 날에는 다시 입력한다.
 */
export default function SeatSpotCard({ line, next, onChat, autoEdit = false, onSaved, presetCar = "" }: { line: LineId; next?: string; onChat?: () => void; autoEdit?: boolean; onSaved?: () => void; presetCar?: string }) {
  const t = useT();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [edit, setEdit] = useState(false);
  const [car, setCar] = useState("");
  const [seat, setSeat] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);
  // 힌트 사진: undefined = 그대로, "" = 지우기, data URL = 새 사진
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [photoVer, setPhotoVer] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ spot: Spot | null }>("/api/seat/spot").then((r) => {
      const sp = r.ok ? r.data.spot : null;
      setSpot(sp);
      // 처음이면 바로 그림을 펼쳐 고르게 한다. 좌석 없이 칸만 저장한 경우(대화로 알림)는 그대로 둔다.
      // 칸이 없으면(탑승 전 착의 메모만 남긴 경우) 칸부터 고르게 하고, 메모는 그대로 보여 준다.
      // autoEdit(수락 직후 메모창)이면 기존 값을 채운 채 바로 편집으로 연다.
      if (!sp || !sp.car || autoEdit) {
        setCar(presetCar || sp?.car || "");
        setSeat(sp?.seat ?? "");
        setMemo(sp?.memo ?? "");
        setEdit(true);
      }
      setLoaded(true);
    });
  }, []);

  // 앉았어요 뒤에 고른 칸은 그대로 쓴다(다시 묻지 않는다).
  useEffect(() => {
    if (presetCar) setCar(presetCar);
  }, [presetCar]);

  const startEdit = () => {
    setCar(spot?.car ?? "");
    setSeat(spot?.seat ?? "");
    setMemo(spot?.memo ?? "");
    setPhoto(undefined);
    setMsg("");
    setEdit(true);
  };

  const save = async () => {
    if (!car) return setMsg(t("칸 번호를 골라 주세요."));
    // 좌석은 선택: 그림으로 짚기 어려우면 칸만 저장하고 대화로 알린다.
    setBusy(true);
    const r = await api<{ spot: Spot }>("/api/seat/spot", "PUT", { car, seat, memo, ...(photo !== undefined ? { photo } : {}) });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setSpot(r.data.spot);
    setPhoto(undefined);
    setPhotoVer((v) => v + 1);
    setEdit(false);
    setMsg(seat ? t("저장했어요. 매칭된 상대에게 알렸어요.") : t("칸만 저장했어요. 자세한 자리는 대화로 알려 주세요."));
    onSaved?.();
  };

  const clear = async () => {
    setBusy(true);
    const r = await api("/api/seat/spot", "DELETE");
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setSpot(null);
    setMsg("");
  };

  if (!loaded) return <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4" data-block-id="S073" data-block-name="내 자리 위치">
      {!edit && spot && (
        <div className="space-y-3">
          {spot.seat && <SeatMap value={spot.seat} car={spot.car} next={next} readOnly />}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-sub">{t("오늘 내 자리")}</p>
              <p className="text-[15px] font-semibold text-ink">{spotText(spot)}</p>
              {spot.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/seat/spot/photo?v=${photoVer}`} alt={t("오늘의 힌트 사진")} className="mt-2 h-20 w-20 rounded-xl border border-line object-cover" />
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="rounded-xl bg-bg px-3 py-2 text-[14px] font-semibold text-ink" onClick={startEdit}>{t("수정")}</button>
              <button type="button" className="rounded-xl bg-bg px-3 py-2 text-[14px] text-sub" disabled={busy} onClick={clear}>{t("지우기")}</button>
            </div>
          </div>
          {onChat && <ChatInstead onChat={onChat} />}
        </div>
      )}
      {edit && (
        <div className="space-y-4">
          {presetCar && car === presetCar ? (
            <p className="text-sm text-sub">
              {t("① 탄 칸")} <b className="num text-ink">{car}{t("번째 칸")}</b>
            </p>
          ) : (
          <label className="block w-1/2 text-sm text-sub">
            {t("① 탄 칸")}
            <select className={`${field} mt-1`} value={car} onChange={(e) => setCar(e.target.value)}>
              <option value="">{t("고르세요")}</option>
              {carNumbersOf(line).map((c) => (
                <option key={c} value={c}>{c}{t("번째 칸")}</option>
              ))}
            </select>
          </label>
          )}
          <div className="space-y-1.5">
            <p className="text-sm text-sub">{t("② 그림에서 앉은 좌석 누르기 (선택)")}</p>
            <SeatMap value={seat} onChange={setSeat} car={car} next={next} />
          </div>
          {onChat && <ChatInstead onChat={onChat} />}
          <div className="space-y-2">
            <p className="text-sm text-sub">{t("③ 오늘의 힌트 (선택)")}</p>
            <textarea className={field} rows={2} maxLength={80} placeholder={t("예: 네이비 패딩, 검정 백팩, 책 읽는 중")} value={memo} onChange={(e) => setMemo(e.target.value)} />
            <div className="flex items-center gap-3">
              {(photo || (photo === undefined && spot?.photo)) ? (
                <div className="relative h-20 w-20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo || `/api/seat/spot/photo?v=${photoVer}`} alt={t("오늘의 힌트 사진")} className="h-20 w-20 rounded-xl border border-line object-cover" />
                  <button type="button" aria-label={t("사진 빼기")} onClick={() => setPhoto("")} className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-ink text-white">×</button>
                </div>
              ) : (
                <button type="button" data-block-id="B263" data-block-name="힌트 사진 올리기" onClick={() => fileRef.current?.click()} className="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-line text-[12px] text-sub">
                  {t("+ 사진")}
                </button>
              )}
              <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-sub">{t("사진도 선택이에요. 얼굴이 나오지 않아도 돼요. 옷이나 가방 사진이면 충분해요. 수락된 상대만 오늘 하루 볼 수 있어요.")}</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={t("힌트 사진 올리기")}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setPhoto(await shrink(f));
                } catch {
                  setMsg(t("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요."));
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-xl bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-40" disabled={busy} onClick={save}>{t("저장")}</button>
            {spot?.seat && <button type="button" className="rounded-xl bg-bg px-4 py-3 text-[15px] text-sub" onClick={() => setEdit(false)}>{t("취소")}</button>}
          </div>
        </div>
      )}
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  );
}

/** 그림으로 짚기 어려울 때: 매칭 탭으로 가서 매칭된 상대 대화를 연다. */
function ChatInstead({ onChat }: { onChat: () => void }) {
  const t = useT();
  return (
    <div data-block-id="S076" data-block-name="대화로 자리 알리기" className="flex items-center justify-between gap-3 rounded-xl bg-accentSoft/60 px-3 py-2.5">
      <p className="min-w-0 text-[13px] leading-snug text-sub">{t("그림으로 알리기 어렵나요? 매칭된 상대와 대화로 알려 주세요.")}</p>
      <button type="button" data-block-id="B264" data-block-name="대화로 알리기" className="shrink-0 rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-accent" onClick={onChat}>
        {t("대화로 알리기")}
      </button>
    </div>
  );
}
