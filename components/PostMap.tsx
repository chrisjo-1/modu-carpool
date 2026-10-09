"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/types";
import { Card, Tag, btnPrimary, scheduleText, useLang, useT } from "./ui";

type Refs = { map: import("leaflet").Map; layer: import("leaflet").LayerGroup; line: import("leaflet").LayerGroup; L: typeof import("leaflet") };
const SEOUL: [number, number] = [37.5665, 126.978];

const pin = (rider: boolean, on: boolean) =>
  `<svg width="${on ? 34 : 28}" height="${on ? 42 : 35}" viewBox="0 0 32 40"><path d="M16 38s12-11.5 12-21A12 12 0 0 0 4 17c0 9.5 12 21 12 21z" fill="${rider ? "#fff" : "#2F6BFF"}" stroke="${rider ? "#2F6BFF" : "#fff"}" stroke-width="${rider ? 3 : 2}"/><circle cx="16" cy="17" r="4.5" fill="${rider ? "#2F6BFF" : "#fff"}"/></svg>`;

/** 찾기 > 지도: 글의 출발지를 핀으로 보여 주고, 누르면 아래에 요약과 경로선을 보여 준다. */
export default function PostMap({ posts, onOpen, here }: { posts: Post[]; onOpen: (p: Post) => void; here: { lat: number; lng: number } | null }) {
  const t = useT();
  const lang = useLang();
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<Refs | null>(null);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<Post | null>(null);
  const placed = posts.filter((p) => p.originLat != null && p.originLng != null && !p.ended);
  const missing = posts.filter((p) => !p.ended).length - placed.length;

  useEffect(() => {
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !box.current || refs.current) return;
      const map = L.map(box.current, { zoomControl: true }).setView(SEOUL, 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
      refs.current = { map, layer: L.layerGroup().addTo(map), line: L.layerGroup().addTo(map), L };
      setReady(true);
    });
    return () => {
      alive = false;
      refs.current?.map.remove();
      refs.current = null;
    };
  }, []);

  // 핀 다시 그리기(목록·선택이 바뀔 때)
  const key = placed.map((p) => p.id).join(",");
  useEffect(() => {
    const r = refs.current;
    if (!ready || !r) return;
    r.layer.clearLayers();
    for (const p of placed) {
      const on = sel?.id === p.id;
      const icon = r.L.divIcon({ className: "", iconSize: on ? [34, 42] : [28, 35], iconAnchor: on ? [17, 40] : [14, 33], html: pin(p.role === "rider", on) });
      r.L.marker([p.originLat as number, p.originLng as number], { icon, title: `${p.origin} → ${p.dest}`, keyboard: true, zIndexOffset: on ? 1000 : 0 })
        .on("click", () => setSel(p))
        .addTo(r.layer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, sel?.id]);

  // 처음 한 번: 모든 핀(또는 내 위치)이 보이게 맞춘다.
  const fitted = useRef(false);
  useEffect(() => {
    const r = refs.current;
    if (!ready || !r || fitted.current) return;
    fitted.current = true;
    if (here) r.map.setView([here.lat, here.lng], 13);
    else if (placed.length) r.map.fitBounds(r.L.latLngBounds(placed.map((p) => [p.originLat as number, p.originLng as number] as [number, number])), { padding: [30, 30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  // 선택한 글의 출발→도착 선
  useEffect(() => {
    const r = refs.current;
    if (!ready || !r) return;
    r.line.clearLayers();
    if (!sel || sel.destLat == null || sel.destLng == null) return;
    const a: [number, number] = [sel.originLat as number, sel.originLng as number];
    const b: [number, number] = [sel.destLat, sel.destLng as number];
    r.L.polyline([a, b], { color: "#2F6BFF", weight: 2, dashArray: "6 6" }).addTo(r.line);
    r.L.circleMarker(b, { radius: 6, color: "#fff", weight: 2, fillColor: "#1B2433", fillOpacity: 1 }).addTo(r.line);
  }, [ready, sel]);

  useEffect(() => {
    if (sel && !placed.some((p) => p.id === sel.id)) setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div data-block-id="C209" data-block-name="카풀 지도" className="space-y-3">
      <div className="relative isolate z-0 overflow-hidden rounded-3xl border border-line">
        <div ref={box} className="h-[420px] w-full bg-bg" role="application" aria-label={t("카풀 지도")} />
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-sub">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-accent" />{t("운전자 글")}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-accent bg-white" />{t("탑승자 글")}</span>
        <span>{t("핀은 출발지예요.")}</span>
        {missing > 0 && <span>{t("위치 정보가 없는 글")} {missing}{t("개는 목록에서 볼 수 있어요.")}</span>}
      </p>
      {sel ? (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Tag tone="accent">{sel.role === "driver" ? t("운전자") : t("탑승자")}</Tag>
            {sel.regular && <Tag>{t("정기카풀")}</Tag>}
            {sel.status === "progress" && <Tag tone="accent">{t("카풀 진행 중")}</Tag>}
          </div>
          <p className="text-[17px] font-semibold">{sel.origin} → {sel.dest}</p>
          <p className="num text-[14px] text-sub">{scheduleText(sel, lang)} · {sel.owner}</p>
          <button data-block-id="B209" data-block-name="지도에서 글 보기" className={btnPrimary} onClick={() => onOpen(sel)}>{t("자세히 보기")}</button>
        </Card>
      ) : (
        placed.length > 0 && <p className="px-1 text-center text-[14px] text-sub">{t("핀을 누르면 카풀 정보를 볼 수 있어요.")}</p>
      )}
    </div>
  );
}
