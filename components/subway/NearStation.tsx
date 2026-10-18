"use client";
import { useState } from "react";
import { api, useT } from "../ui";

type Near = { station: string; line: string; distance: number; walkMin: number };

/**
 * 지하철 메뉴: 버튼을 누르면 현재 위치에서 가까운 역 3곳을 보여 준다.
 * 위치 권한은 누를 때만 묻고, 위치는 서버에 저장하지 않는다.
 */
export default function NearStation({ board }: { board?: string }) {
  const t = useT();
  const [items, setItems] = useState<Near[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const find = () => {
    if (!("geolocation" in navigator)) return setMsg(t("이 기기에서는 위치를 확인할 수 없어요."));
    setBusy(true);
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const r = await api<{ items: Near[]; note?: string }>(`/api/seat/near?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`);
        setBusy(false);
        if (!r.ok) return setMsg(t(r.error));
        setItems(r.data.items);
        if (!r.data.items.length) setMsg(t(r.data.note || "1.5km 안에 지하철역이 없어요."));
      },
      (e) => {
        setBusy(false);
        setMsg(e.code === e.PERMISSION_DENIED ? t("위치 권한을 허용하면 가까운 역을 보여 드려요. 브라우저 설정에서 위치를 허용해 주세요.") : t("위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div data-block-id="C132" data-block-name="가까운 역" className="flex flex-col space-y-2">
      <button
        type="button"
        data-block-id="B261"
        disabled={busy}
        onClick={find}
        className="ml-auto flex min-h-0 items-center gap-1 py-1 text-[13px] font-semibold text-violet disabled:opacity-60"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        {busy ? t("위치 확인 중…") : items ? t("다시 찾기") : t("현위치 가까운 역")}
      </button>
      {items && items.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {items.map((s, i) => (
            <li key={s.station} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                  {i === 0 && <span className="rounded-full bg-violet px-1.5 py-0.5 text-[11px] font-bold text-white">{t("가장 가까움")}</span>}
                  <span className="truncate">{s.station}{t("역")}</span>
                  {board && s.station === board && <span className="rounded-full bg-violetSoft px-1.5 py-0.5 text-[11px] font-semibold text-violet">{t("출근 타는 역")}</span>}
                </p>
                {s.line && <p className="text-[13px] text-sub">{s.line}</p>}
              </div>
              <p className="num shrink-0 text-right text-[13px] text-sub">
                <b className="text-ink">{s.distance >= 1000 ? `${(s.distance / 1000).toFixed(1)}km` : `${s.distance}m`}</b>
                <br />
                {t("걸어서 약")} {s.walkMin}{t("분")}
              </p>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-[13px] text-sub">{msg}</p>}
    </div>
  );
}
