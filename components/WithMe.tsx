"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { api, useT } from "./ui";

/**
 * 남의 카풀 글 상세의 '나와의 매칭'(2026-11-27 사용자 지시: 매칭률과 경로 일치를 지도로, 요일·시간 일치는 추후).
 * GET /api/matches?with=글ID → 매칭률·경로 일치율 + 지도(운전자 길 파랑·탑승자 길 초록·겹치는 구간 굵게·타고 내리는 곳 점).
 * Home의 PostDetail이 로그인·남의 글일 때만 dynamic으로 불러온다.
 */
type LL = [number, number];
type Res = {
  mine: { origin: string; dest: string; kind: "post" | "commute" };
  myRole: "driver" | "rider";
  pct: number;
  routePct: number | null;
  originKm: number;
  destKm: number | null;
  onRoute: boolean;
  driver: { o: LL; d: LL | null };
  rider: { o: LL; d: LL | null };
  overlap: { a: LL; b: LL } | null;
};
type Out = Res | { none: true } | { sameRole: true } | { skip: true };

const BLUE = "#2F6BFF", GREEN = "#00754A", NAVY = "#1E3A8A"; // 토큰 accent·mint·brand와 같은 값(leaflet엔 글자로)

export default function WithMe({ postId }: { postId: string }) {
  const t = useT();
  const [data, setData] = useState<Out | null>(null);
  useEffect(() => {
    let alive = true;
    api<Out>(`/api/matches?with=${postId}`).then((r) => { if (alive && r.ok) setData(r.data); });
    return () => { alive = false; };
  }, [postId]);

  if (!data || "skip" in data || "sameRole" in data) return null;
  if ("none" in data) {
    return (
      <div data-block-id="C462" data-block-name="나와의 매칭 · 내 정보 없음" className="rounded-2xl bg-bg px-4 py-3 text-[14px] text-sub">
        {t("내 출퇴근 경로를 올리면 이 글과의 매칭률과 겹치는 경로를 볼 수 있어요.")}
      </div>
    );
  }
  const d = data;
  const level = d.pct >= 70 ? t("매우 잘 맞아요") : d.pct >= 40 ? t("어느 정도 맞아요") : d.pct > 0 ? t("조금 맞아요") : t("경로가 많이 달라요");
  return (
    <div data-block-id="C462" data-block-name="나와의 매칭" className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-sub">{t("나와의 매칭")}</p>
          <p className="mt-0.5 text-[13px] text-sub">{level}</p>
        </div>
        <p className="num text-[30px] font-bold leading-none text-brand">{d.pct}<span className="text-[18px]">%</span></p>
      </div>
      {d.routePct != null && (
        <div>
          <div className="flex justify-between text-[13px]"><span className="text-sub">{t("경로 일치율")}</span><b className="num">{d.routePct}%</b></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, d.routePct)}%` }} /></div>
        </div>
      )}
      <p className="text-[13px] text-sub">
        {t("출발지 사이")} <b className="num text-ink">{d.originKm}km</b>
        {d.destKm != null && <> · {t("도착지 사이")} <b className="num text-ink">{d.destKm}km</b></>}
        {d.onRoute && <> · <b className="text-mint">{t("가는 길 위")}</b></>}
      </p>
      <OverlapMap d={d} />
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-sub">
        <li className="flex items-center gap-1"><span className="inline-block h-1 w-4 rounded" style={{ background: BLUE }} />{t("운전자 길")}</li>
        <li className="flex items-center gap-1"><span className="inline-block h-1 w-4 rounded" style={{ background: GREEN }} />{t("탑승자 길")}</li>
        {d.overlap && <li className="flex items-center gap-1"><span className="inline-block h-1.5 w-4 rounded" style={{ background: NAVY }} />{t("겹치는 구간")}</li>}
      </ul>
      <p className="truncate text-[12px] text-sub">
        {d.mine.kind === "post" ? t("비교한 내 글") : t("비교한 내 출퇴근 정보")}: {d.mine.origin} → {d.mine.dest} · {t("직선 기준 예상")}
      </p>
    </div>
  );
}

function OverlapMap({ d }: { d: Res }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [touch, setTouch] = useState(false);
  const [move, setMove] = useState(false);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  useEffect(() => {
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !box.current || mapRef.current) return;
      const tc = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      setTouch(tc);
      const map = L.map(box.current, { zoomControl: false, dragging: !tc, scrollWheelZoom: false, attributionControl: true });
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
      const pts: LL[] = [];
      const line = (a: LL, b: LL | null, color: string, dash?: string) => {
        if (!b) return;
        L.polyline([a, b], { color, weight: 4, opacity: 0.75, dashArray: dash }).addTo(map);
        pts.push(a, b);
      };
      line(d.driver.o, d.driver.d, BLUE);
      line(d.rider.o, d.rider.d, GREEN, "6 6");
      if (d.overlap) L.polyline([d.overlap.a, d.overlap.b], { color: NAVY, weight: 9, opacity: 0.9 }).addTo(map);
      const dot = (p: LL, color: string, label: string) => {
        L.circleMarker(p, { radius: 6, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(label).addTo(map);
        pts.push(p);
      };
      dot(d.driver.o, BLUE, t("운전자 출발"));
      if (d.driver.d) dot(d.driver.d, BLUE, t("운전자 도착"));
      dot(d.rider.o, GREEN, t("탑승자 출발"));
      if (d.rider.d) dot(d.rider.d, GREEN, t("탑승자 도착"));
      map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 15 });
    });
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // d는 글마다 한 번 받아 오므로 처음 그릴 때만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = () => {
    const m = mapRef.current;
    if (!m) return;
    if (move) m.dragging.disable();
    else m.dragging.enable();
    setMove(!move);
  };
  return (
    <div className="relative">
      <div ref={box} className="h-[220px] w-full overflow-hidden rounded-xl bg-bg" aria-label={t("겹치는 경로 지도")} />
      {touch && (
        <button type="button" data-block-id="B524" data-block-name="나와의 매칭 지도 움직이기" onClick={toggle}
          className="absolute right-2 top-2 z-[400] rounded-lg border border-line bg-white px-2.5 py-1 text-[12px] font-semibold text-ink">
          {move ? t("움직이기 끄기") : t("지도 움직이기")}
        </button>
      )}
    </div>
  );
}
