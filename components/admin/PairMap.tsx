"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export type MapPoint = {
  role: "driver" | "rider";
  label: string;
  homeShort: string; workShort: string;
  homeLat: number | null; homeLng: number | null; workLat: number | null; workLng: number | null;
};

const COLOR = { driver: "#2F6BFF", rider: "#00754A" } as const;

/**
 * 정기 매칭 지도(S421): 운전자 집→회사(파랑 굵은 선), 탑승자 집→회사(초록 선),
 * 운전자가 탑승자를 들렀다 가는 길(회색 점선: 운전자 집→탑승자 집→탑승자 회사→운전자 회사). 직선이라 실제 도로와는 달라요.
 */
export default function PairMap({ driver, riders, onClose }: { driver: MapPoint; riders: MapPoint[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !box.current) return;
      map = L.map(box.current, { zoomControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
      const pts: [number, number][] = [];
      const ll = (lat: number | null, lng: number | null): [number, number] | null => (lat == null || lng == null ? null : [lat, lng]);
      const dot = (p: [number, number], color: string, filled: boolean, text: string) => {
        L.circleMarker(p, { radius: filled ? 7 : 6, color, weight: 3, fillColor: filled ? color : "#fff", fillOpacity: 1 }).bindTooltip(text, { direction: "top" }).addTo(map!);
        pts.push(p);
      };
      const dh = ll(driver.homeLat, driver.homeLng);
      const dw = ll(driver.workLat, driver.workLng);
      if (dh && dw) L.polyline([dh, dw], { color: COLOR.driver, weight: 5, opacity: 0.85 }).addTo(map);
      for (const r of riders) {
        const rh = ll(r.homeLat, r.homeLng);
        const rw = ll(r.workLat, r.workLng);
        if (rh && rw) L.polyline([rh, rw], { color: COLOR.rider, weight: 4, opacity: 0.85 }).addTo(map);
        if (dh && dw && rh && rw) L.polyline([dh, rh, rw, dw], { color: "#6B7684", weight: 2, dashArray: "6 6", opacity: 0.9 }).addTo(map);
        if (rh) dot(rh, COLOR.rider, false, `탑승자 출발 · ${r.homeShort}`);
        if (rw) dot(rw, COLOR.rider, true, `탑승자 도착 · ${r.workShort}`);
      }
      if (dh) dot(dh, COLOR.driver, false, `운전자 출발 · ${driver.homeShort}`);
      if (dw) dot(dw, COLOR.driver, true, `운전자 도착 · ${driver.workShort}`);
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
      else map.setView([37.5665, 126.978], 11);
    });
    return () => {
      alive = false;
      map?.remove();
    };
  }, [driver, riders]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" role="dialog" aria-modal="true" onClick={onClose}>
      <div data-block-id="S421" data-block-name="매칭 지도" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="font-bold">매칭 지도</h3>
          <button data-block-id="B456" data-block-name="매칭 지도 닫기" className="min-h-0 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold" onClick={onClose}>닫기</button>
        </div>
        <div ref={box} className="h-[60vh] w-full bg-bg" />
        <div className="space-y-1 px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-6 rounded bg-accent" />운전자 길</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-6 rounded bg-mint" />탑승자 길</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-6 border-t-2 border-dashed border-sub" />들렀다 가는 길</span>
            <span className="text-xs text-sub">빈 점 = 출발 · 채운 점 = 도착</span>
          </p>
          <p className="text-xs text-sub">직선으로 이은 그림이라 실제 도로와는 달라요. 운전자: {driver.label}{riders.length ? ` · 탑승자: ${riders.map((r) => r.label).join(", ")}` : ""}</p>
        </div>
      </div>
    </div>
  );
}
