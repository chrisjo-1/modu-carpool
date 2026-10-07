"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";
import { api, field, useLang, useT } from "./ui";

type Item = { name: string; address: string; lat: number; lng: number };
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** 끌어서 옮길 수 있는 핀이 있는 지도. 지도를 눌러도 핀이 그 자리로 간다. */
function PinMap({ lat, lng, onMove }: { lat: number; lng: number; onMove: (lat: number, lng: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<{ map: import("leaflet").Map; marker: import("leaflet").Marker } | null>(null);
  const moved = useRef(onMove);
  moved.current = onMove;

  useEffect(() => {
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !box.current || refs.current) return;
      const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 16);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
      const icon = L.divIcon({
        className: "",
        iconSize: [32, 40],
        iconAnchor: [16, 38],
        html: '<svg width="32" height="40" viewBox="0 0 32 40"><path d="M16 38s12-11.5 12-21A12 12 0 0 0 4 17c0 9.5 12 21 12 21z" fill="#2F6BFF" stroke="#fff" stroke-width="2"/><circle cx="16" cy="17" r="4.5" fill="#fff"/></svg>',
      });
      const marker = L.marker([lat, lng], { draggable: true, icon, keyboard: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        moved.current(round(p.lat), round(p.lng));
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        moved.current(round(e.latlng.lat), round(e.latlng.lng));
      });
      refs.current = { map, marker };
    });
    return () => {
      alive = false;
      refs.current?.map.remove();
      refs.current = null;
    };
    // 지도는 한 번만 만든다. 좌표 변화는 아래 효과에서 반영한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const cur = r.marker.getLatLng();
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
      r.marker.setLatLng([lat, lng]);
      r.map.setView([lat, lng]);
    }
  }, [lat, lng]);

  return <div ref={box} data-block-id="C050" data-block-name="핀 지도" className="relative isolate z-0 h-52 w-full overflow-hidden rounded-xl border border-line" />;
}

export default function PlaceField({
  label,
  value,
  onChange,
  placeholder,
  blockId,
  locate = false,
  toast,
}: {
  label: string;
  value: Place;
  onChange: (p: Place) => void;
  placeholder: string;
  blockId: string;
  /** 현위치 불러오기와 지도 핀을 함께 보여준다. */
  locate?: boolean;
  toast: (m: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const typed = useRef(false);
  const seq = useRef(0);

  // 입력이 멈추면 검색한다.
  useEffect(() => {
    if (!typed.current) return;
    const q = value.name.trim();
    if (q.length < 2) {
      setItems([]);
      setSearched(false);
      return;
    }
    const mine = ++seq.current;
    const id = setTimeout(async () => {
      const r = await api<{ items: Item[] }>(`/api/places?q=${encodeURIComponent(q)}&lang=${lang}`);
      if (mine !== seq.current) return;
      setItems(r.ok ? r.data.items ?? [] : []);
      setSearched(true);
      setOpen(true);
    }, 400);
    return () => clearTimeout(id);
  }, [value.name, lang]);

  const pick = (i: Item) => {
    typed.current = false;
    seq.current++;
    setOpen(false);
    onChange({ name: i.name, lat: i.lat, lng: i.lng });
  };

  /** 좌표를 주소 이름으로 바꿔 채운다. 실패하면 이름은 그대로 둔다. */
  const setByCoord = async (lat: number, lng: number, keepName: string) => {
    typed.current = false;
    seq.current++;
    onChange({ name: keepName, lat, lng });
    const r = await api<{ name: string }>(`/api/places?lat=${lat}&lng=${lng}&lang=${lang}`);
    if (r.ok && r.data.name) onChange({ name: r.data.name, lat, lng });
  };

  const useHere = () => {
    if (!("geolocation" in navigator)) return toast(t("이 기기는 위치 확인을 지원하지 않아요."));
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await setByCoord(round(pos.coords.latitude), round(pos.coords.longitude), value.name || t("현재 위치"));
        setBusy(false);
      },
      (err) => {
        setBusy(false);
        toast(t(err.code === err.PERMISSION_DENIED ? "위치 권한을 허용해 주세요." : "현재 위치를 찾지 못했어요."));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const hasPin = value.lat != null && value.lng != null;

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <label htmlFor={blockId} className="text-sm text-sub">{label}</label>
        {locate && (
          <button type="button" data-block-id="B050" data-block-name="현위치 불러오기" onClick={useHere} disabled={busy} className="min-h-0 py-1 text-[14px] font-semibold text-accent disabled:opacity-50">
            {busy ? t("위치를 찾는 중…") : t("현위치 불러오기")}
          </button>
        )}
      </div>
      <div className="relative">
        <input
          id={blockId}
          data-block-id={blockId}
          className={field}
          required
          minLength={2}
          maxLength={60}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${blockId}-list`}
          placeholder={placeholder}
          value={value.name}
          onChange={(e) => {
            typed.current = true;
            onChange({ name: e.target.value, lat: null, lng: null });
          }}
          onFocus={() => items.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && (
          <ul id={`${blockId}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-white shadow-card">
            {items.length === 0 && searched && <li className="px-4 py-3 text-[14px] text-sub">{t("검색 결과가 없어요. 직접 입력해도 됩니다.")}</li>}
            {items.map((i, n) => (
              <li key={`${i.lat},${i.lng},${n}`} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)} className="block w-full px-4 py-2.5 text-left">
                  <span className="block text-[15px] font-semibold">{i.name}</span>
                  {i.address && <span className="block truncate text-[13px] text-sub">{i.address}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {locate && hasPin && (
        <>
          <PinMap lat={value.lat as number} lng={value.lng as number} onMove={(lat, lng) => setByCoord(lat, lng, value.name)} />
          <p className="text-[13px] text-sub">{t("핀을 끌거나 지도를 눌러 타는 위치를 정확히 맞출 수 있어요.")}</p>
        </>
      )}
    </div>
  );
}
