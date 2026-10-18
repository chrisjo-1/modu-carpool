"use client";
import { useEffect, useState } from "react";
import { carNumbersOf, type LineId } from "@/lib/subway";
import { api, field, useT } from "../ui";
import SeatMap from "./SeatMap";
import { spotText } from "./SubwayMatches";

type Spot = { car: string; door: string; side: "left" | "right" | ""; seat: string; memo: string };

/** 오늘의 힌트로 눌러 넣는 말: 옷 색깔과 소지품 */
const COLORS = ["검정", "흰색", "회색", "네이비", "베이지", "빨강", "파랑", "초록"];
const ITEMS = ["상의", "패딩", "코트", "모자", "백팩", "안경", "마스크", "이어폰"];

/**
 * 오늘 앉은 자리: 칸을 고르고 차량 그림에서 좌석을 누른다. 오늘의 힌트(옷 색깔·소지품)를 함께 남긴다.
 * 수락된 상대에게만 보이고, 저장하면 상대에게 알린다. 하루만 쓰고 다음 날에는 다시 입력한다.
 */
export default function SeatSpotCard({ line }: { line: LineId }) {
  const t = useT();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [edit, setEdit] = useState(false);
  const [car, setCar] = useState("");
  const [seat, setSeat] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<{ spot: Spot | null }>("/api/seat/spot").then((r) => {
      setLoaded(true);
      if (r.ok && r.data.spot) setSpot(r.data.spot);
    });
  }, []);

  const startEdit = () => {
    setCar(spot?.car ?? "");
    setSeat(spot?.seat ?? "");
    setMemo(spot?.memo ?? "");
    setMsg("");
    setEdit(true);
  };

  /** 힌트 단어를 메모에 이어 붙인다(이미 있으면 뺀다). */
  const toggleWord = (w: string) => {
    const words = memo.split(/\s*,\s*|\s+/).filter(Boolean);
    const next = words.includes(w) ? words.filter((x) => x !== w) : [...words, w];
    setMemo(next.join(" ").slice(0, 40));
  };

  const save = async () => {
    if (!car) return setMsg(t("칸 번호를 골라 주세요."));
    if (!seat) return setMsg(t("앉은 좌석을 그림에서 골라 주세요."));
    setBusy(true);
    const r = await api<{ spot: Spot }>("/api/seat/spot", "PUT", { car, seat, memo });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setSpot(r.data.spot);
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
          {spot.seat && <SeatMap value={spot.seat} car={spot.car} readOnly />}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-sub">{t("오늘 내 자리")}</p>
              <p className="text-[15px] font-semibold text-ink">{spotText(spot)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="rounded-xl bg-bg px-3 py-2 text-[14px] font-semibold text-ink" onClick={startEdit}>{t("수정")}</button>
              <button type="button" className="rounded-xl bg-bg px-3 py-2 text-[14px] text-sub" disabled={busy} onClick={clear}>{t("지우기")}</button>
            </div>
          </div>
        </div>
      )}
      {!edit && !spot && (
        <div className="space-y-2">
          <p className="text-[14px] leading-relaxed text-sub">{t("자리에 앉았다면 그림에서 좌석을 눌러 알려 주세요. 매칭된 상대에게만 보여요.")}</p>
          <button type="button" className="w-full rounded-xl bg-violet py-3 text-[15px] font-semibold text-white" onClick={startEdit}>{t("자리 위치 입력")}</button>
        </div>
      )}
      {edit && (
        <div className="space-y-4">
          <label className="block w-1/2 text-sm text-sub">
            {t("칸")}
            <select className={`${field} mt-1`} value={car} onChange={(e) => setCar(e.target.value)}>
              <option value="">{t("고르세요")}</option>
              {carNumbersOf(line).map((c) => (
                <option key={c} value={c}>{c}{t("번째 칸")}</option>
              ))}
            </select>
          </label>
          <SeatMap value={seat} onChange={setSeat} car={car} />
          <div className="space-y-2">
            <p className="text-sm text-sub">{t("오늘의 힌트 (선택)")}</p>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <Chip key={c} on={memo.split(/\s+/).includes(c)} onClick={() => toggleWord(c)}>{c}</Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ITEMS.map((c) => (
                <Chip key={c} on={memo.split(/\s+/).includes(c)} onClick={() => toggleWord(c)}>{c}</Chip>
              ))}
            </div>
            <input className={field} maxLength={40} placeholder={t("예: 네이비 패딩 백팩, 책 읽는 중")} value={memo} onChange={(e) => setMemo(e.target.value)} />
            <p className="text-[12px] text-sub">{t("옷 색깔이나 소지품처럼 상대가 알아볼 수 있는 힌트를 남겨 주세요.")}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-xl bg-violet py-3 text-[15px] font-semibold text-white disabled:opacity-40" disabled={busy} onClick={save}>{t("저장")}</button>
            <button type="button" className="rounded-xl bg-bg px-4 py-3 text-[15px] text-sub" onClick={() => setEdit(false)}>{t("취소")}</button>
          </div>
        </div>
      )}
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-violet bg-violetSoft font-semibold text-violet" : "border-line bg-white text-sub"}`}>
      {children}
    </button>
  );
}
