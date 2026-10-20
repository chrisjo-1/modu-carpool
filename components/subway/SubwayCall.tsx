"use client";
import { useState } from "react";
import { api, useT } from "../ui";
import { carNumbersOf, type LineId } from "@/lib/subway";

/** 칸 기록에 쓰는 키(칸 안내와 같은 값). 탑승역·방향·시간대는 화면에서 넘겨받는다. dow는 혼잡도 구분용(기록은 요일을 나누지 않는다). */
export type SeatKey = { line: LineId; station: string; dir: "up" | "down"; dow: string; slot: string };

export type Posture = "sit" | "stand" | "";

/** 지하철 화면에서 오늘 고른 노선·승차역·하차역·진행 방향. 서버가 등록 정보 대신 쓴다. */
export type TodayRide = { line: LineId; board: string; alight: string; next: string };

/**
 * 앉았어요 한 번. 같은 노선·같은 방향으로 자리를 받을 수 있는 분 모두에게 푸시를 보내고,
 * 결과와 상관없이 오늘 첫 번째에 적립한다. 그다음 어느 칸·문에 앉았는지 한 번만 묻는다(선택).
 * 고른 칸은 onCar로 넘겨 자리 위치 입력에서 다시 묻지 않게 한다.
 */
export default function SubwayCall({ hasPlan, onPosture, onSent, onCar, seatKey, trip = "go", ride }: { hasPlan: boolean; posture?: Posture; onPosture: (p: Posture) => void; onSent: () => void; onCar?: (car: string) => void; seatKey?: SeatKey; trip?: "go" | "back"; ride?: TodayRide }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<{ sent: number; credit: number } | null>(null);
  const [car, setCar] = useState("");
  const [door, setDoor] = useState("");
  const [recorded, setRecorded] = useState(false);
  const cars = seatKey ? carNumbersOf(seatKey.line) : [];

  const record = async (nextCar: string, nextDoor: string) => {
    if (!seatKey || !nextCar || !nextDoor) return;
    const r = await api("/api/seat/car/feedback", "POST", { ...seatKey, car: nextCar, entrance: nextDoor, seated: true });
    if (r.ok) setRecorded(true);
    else setMsg(t(r.error));
  };

  const sit = async () => {
    setBusy(true);
    setMsg("");
    const r = await api<{ sent: number; credit: number }>("/api/seat/call", "POST", { trip, today: ride });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    onPosture("sit");
    setDone({ sent: r.data.sent, credit: r.data.credit });
    onSent();
  };

  if (!hasPlan) return <p className="text-[14px] text-sub">{t("설정에서 지하철 정보를 먼저 등록해 주세요.")}</p>;

  return (
    <div data-block-id="S074" data-block-name="앉았어요" className="space-y-3">
      {!done && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
          <p className="min-w-0 text-[13px] leading-snug text-sub">{t("앉았다면 같은 방향으로 자리를 받을 분께 알려요.")}</p>
          <button
            type="button"
            data-block-id="B250"
            disabled={busy}
            className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-[15px] font-semibold text-white active:opacity-90 disabled:opacity-60"
            onClick={sit}
          >
            {busy ? t("알리는 중…") : t("앉았어요")}
          </button>
        </div>
      )}
      {done && (
        <div role="status" className="space-y-1 rounded-2xl bg-mintSoft px-4 py-3">
          <p className="text-[15px] font-semibold text-mint">{t("앉으셨군요!")}</p>
          <p className="text-[13px] leading-relaxed text-ink">
            {done.sent > 0 ? `${done.sent}${t("명에게 알렸어요. 상대가 탑승역을 알리면 대화가 열려요.")}` : t("지금은 자리를 받을 분이 없어요. 맞는 분이 생기면 알려 드릴게요.")}
            {done.credit > 0 && <span className="ml-1 font-semibold text-mint">+{done.credit}{t("크레딧 적립")}</span>}
          </p>
          {done.credit === 0 && <p className="text-[12px] text-sub">{t("오늘 앉아가기 크레딧은 이미 받았어요.")}</p>}
          {seatKey && !recorded && (
            <div className="space-y-2 pt-2">
              <p className="text-[13px] font-semibold text-ink">{t("어느 칸·문에 앉았나요? (선택)")}</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("탄 칸")}>
                {cars.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={car === c} onClick={() => { setCar(c); onCar?.(c); record(c, door); }} className={`min-h-[36px] min-w-[44px] rounded-xl border px-2.5 text-[13px] ${car === c ? "border-accent bg-white font-semibold text-accent" : "border-line bg-white text-sub"}`}>
                    {c}{t("칸")}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5" role="radiogroup" aria-label={t("문")}>
                {["1", "2", "3", "4"].map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={door === d} onClick={() => { setDoor(d); record(car, d); }} className={`min-h-[36px] min-w-[44px] rounded-xl border px-2.5 text-[13px] ${door === d ? "border-accent bg-white font-semibold text-accent" : "border-line bg-white text-sub"}`}>
                    {d}{t("번 문")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {recorded && <p className="pt-2 text-[13px] text-mint">{`${car}${t("번째 칸")} ${door}${t("번 문")} · ${t("기록했어요. 다음 칸 추천에 반영돼요.")}`}</p>}
        </div>
      )}
      {msg && <p className="text-[14px] leading-relaxed text-ink">{msg}</p>}
    </div>
  );
}
