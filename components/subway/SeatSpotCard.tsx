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
export default function SeatSpotCard({ line, next }: { line: LineId; next?: string }) {
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
      // 좌석을 아직 고르지 않았으면(처음이거나 칸만 저장된 경우) 바로 그림을 펼쳐 고르게 한다.
      if (!sp || !sp.seat) {
        setCar(sp?.car ?? "");
        setSeat("");
        setMemo(sp?.memo ?? "");
        setEdit(true);
      }
      setLoaded(true);
    });
  }, []);

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
    if (!seat) return setMsg(t("앉은 좌석을 그림에서 골라 주세요."));
    setBusy(true);
    const r = await api<{ spot: Spot }>("/api/seat/spot", "PUT", { car, seat, memo, ...(photo !== undefined ? { photo } : {}) });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setSpot(r.data.spot);
    setPhoto(undefined);
    setPhotoVer((v) => v + 1);
    setEdit(false);
    setMsg(t("저장했어요. 매칭된 상대에게 알렸어요."));
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
        </div>
      )}
      {edit && (
        <div className="space-y-4">
          <label className="block w-1/2 text-sm text-sub">
            {t("① 탄 칸")}
            <select className={`${field} mt-1`} value={car} onChange={(e) => setCar(e.target.value)}>
              <option value="">{t("고르세요")}</option>
              {carNumbersOf(line).map((c) => (
                <option key={c} value={c}>{c}{t("번째 칸")}</option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5">
            <p className="text-sm text-sub">{t("② 그림에서 앉은 좌석 누르기")}</p>
            <SeatMap value={seat} onChange={setSeat} car={car} next={next} />
          </div>
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
            <button type="button" className="flex-1 rounded-xl bg-violet py-3 text-[15px] font-semibold text-white disabled:opacity-40" disabled={busy} onClick={save}>{t("저장")}</button>
            {spot?.seat && <button type="button" className="rounded-xl bg-bg px-4 py-3 text-[15px] text-sub" onClick={() => setEdit(false)}>{t("취소")}</button>}
          </div>
        </div>
      )}
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  );
}
