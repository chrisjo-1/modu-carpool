"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Sparkle } from "./MapSparkle";
import type { Post } from "@/lib/types";
import { Card, Tag, api, btnPrimary, scheduleText, useLang, useT } from "./ui";

type Line = { role: "driver" | "rider"; warp: boolean; chance: number; timeFit: boolean; o: [number, number]; d: [number, number]; postId: string };
type Insights = { km: number; drivers: number; riders: number; hours: Record<string, number>; spots: { lat: number; lng: number; n: number }[]; dest: { drivers: number; riders: number } };
type Lines = { lines: Line[]; total: number; warp: number; fit: number; insights?: Insights | null };
const BLUE = "#2F6BFF", GREEN = "#00754A"; // 토큰 accent·mint와 같은 값(leaflet 선 색은 글자로 넘겨야 함)

type Refs = { map: import("leaflet").Map; layer: import("leaflet").LayerGroup; line: import("leaflet").LayerGroup; dots: import("leaflet").LayerGroup; canvas: import("leaflet").Renderer; L: typeof import("leaflet") };
/** 지도용 가벼운 핀 [글ID, 탑승자면 1, 위도, 경도] */
type Pin = [string, number, number, number];
const SEOUL: [number, number] = [37.5665, 126.978];

const CORAL = "#FF5A3C"; // 토큰 coral과 같은 값
/** 내 글 핀: 코랄색 + '내 출발지' 말풍선(2026-11-08 사용자 "내 출발지가 어디인지 찾기 어려워") */
const minePin = (on: boolean) =>
  `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:${CORAL};color:#fff;border-radius:999px;font:700 12px/20px Pretendard,sans-serif;padding:0 8px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)">내 출발지</div><svg width="${on ? 38 : 34}" height="${on ? 46 : 42}" viewBox="0 0 32 40"><path d="M16 38s12-11.5 12-21A12 12 0 0 0 4 17c0 9.5 12 21 12 21z" fill="${CORAL}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="17" r="5" fill="#fff"/></svg></div>`;
const pin = (rider: boolean, on: boolean) =>
  `<svg width="${on ? 34 : 28}" height="${on ? 42 : 35}" viewBox="0 0 32 40"><path d="M16 38s12-11.5 12-21A12 12 0 0 0 4 17c0 9.5 12 21 12 21z" fill="${rider ? "#fff" : "#2F6BFF"}" stroke="${rider ? "#2F6BFF" : "#fff"}" stroke-width="${rider ? 3 : 2}"/><circle cx="16" cy="17" r="4.5" fill="${rider ? "#2F6BFF" : "#fff"}"/></svg>`;

/** 찾기 > 지도: 글의 출발지를 핀으로 보여 주고, 누르면 아래에 요약과 경로선을 보여 준다. */
/**
 * pinQuery: 받아 둔 글(300건 남짓) 밖의 공개 글까지 지도에 점으로 보이게 서버에서 가벼운 핀을 받는 조건(2026-11-14 사용자 지시).
 * null이면 받지 않는다(내 글만 보기·지역 필터일 때). 점은 캔버스에 그려 수천 개도 가볍고, 누르면 그 글을 받아 와 고른다.
 */
export default function PostMap({ posts, onOpen, here, pinQuery = null }: { posts: Post[]; onOpen: (p: Post) => void; here: { lat: number; lng: number } | null; pinQuery?: string | null }) {
  const t = useT();
  const lang = useLang();
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<Refs | null>(null);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<Post | null>(null);
  const [match, setMatch] = useState<Lines | null>(null);
  const [touch, setTouch] = useState(false);
  const [move, setMove] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const m = refs.current?.map;
    if (!m || !touch) return;
    if (move) m.dragging.enable(); else m.dragging.disable();
  }, [move, touch, ready]);
  const placed = posts.filter((p) => p.originLat != null && p.originLng != null && !p.ended);
  const [pins, setPins] = useState<Pin[]>([]);
  useEffect(() => {
    if (pinQuery == null) return setPins([]);
    let alive = true;
    api<{ pins: Pin[] }>(`/api/posts?pins=1${pinQuery ? `&${pinQuery}` : ""}`).then((r) => alive && r.ok && setPins(r.data.pins));
    return () => { alive = false; };
  }, [pinQuery]);
  const placedIds = new Set(placed.map((p) => p.id));
  const dots = pins.filter((d) => !placedIds.has(d[0]));
  const shown = placed.length + dots.length;
  const missing = posts.filter((p) => !p.ended).length - placed.length;

  useEffect(() => {
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !box.current || refs.current) return;
      // 휴대폰: 화면을 내리다 지도가 끌려가지 않게 한 손가락 끌기는 끈다(두 손가락 확대·[지도 움직이기]로 켬)
      const touch = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
      const map = L.map(box.current, { zoomControl: true, dragging: !touch }).setView(SEOUL, 11);
      setTouch(touch);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
      // 점(받아 두지 않은 글)은 맨 아래, 그 위에 받아 둔 글 핀, 맨 위에 경로선
      refs.current = { map, dots: L.layerGroup().addTo(map), layer: L.layerGroup().addTo(map), line: L.layerGroup().addTo(map), canvas: L.canvas({ padding: 0.5 }), L };
      setReady(true);
    });
    return () => {
      alive = false;
      refs.current?.map.remove();
      refs.current = null;
    };
  }, []);

  // 숫자 묶음(2026-11-14 사용자 지시 '1번으로 하자'): 받아 둔 글(핀)과 그 밖의 글(점)을 함께 supercluster로 묶는다.
  // 멀리 보면 남색 동그라미에 건수, 누르면 풀리는 만큼 확대. 가까이 보면 받아 둔 글은 핀, 나머지는 캔버스 작은 점.
  // 내 글 핀과 고른 글 핀은 묶지 않고 늘 보인다. 지도를 옮기거나 확대할 때마다 보이는 범위만 다시 그린다.
  const key = placed.map((p) => p.id).join(",");
  const dotKey = `${dots.length}:${dots[0]?.[0] ?? ""}:${dots[dots.length - 1]?.[0] ?? ""}`;
  type Feat = { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: { i: number; r: number; id: string } };
  const index = useRef<import("supercluster")<Feat["properties"]> | null>(null);
  const [indexVer, setIndexVer] = useState(0);
  useEffect(() => {
    let alive = true;
    import("supercluster").then(({ default: Supercluster }) => {
      if (!alive) return;
      const feats: Feat[] = [];
      placed.forEach((p, i) => { if (!p.mine) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [p.originLng as number, p.originLat as number] }, properties: { i, r: p.role === "rider" ? 1 : 0, id: p.id } }); });
      for (const [id, rider, lat, lng] of dots) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { i: -1, r: rider, id } });
      const sc = new Supercluster<Feat["properties"]>({ radius: 80, maxZoom: 13, minPoints: 3 });
      sc.load(feats);
      index.current = sc;
      setIndexVer((v) => v + 1);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dotKey]);

  const [view, setView] = useState(0);
  useEffect(() => {
    const m = refs.current?.map;
    if (!ready || !m) return;
    const on = () => setView((v) => v + 1);
    m.on("moveend", on);
    return () => { m.off("moveend", on); };
  }, [ready]);

  useEffect(() => {
    const r = refs.current;
    const sc = index.current;
    if (!ready || !r) return;
    r.layer.clearLayers();
    r.dots.clearLayers();
    const pinOf = (p: Post) => {
      const on = sel?.id === p.id;
      const icon = p.mine
        ? r.L.divIcon({ className: "", iconSize: [80, 68], iconAnchor: [40, 66], html: minePin(on) })
        : r.L.divIcon({ className: "", iconSize: on ? [34, 42] : [28, 35], iconAnchor: on ? [17, 40] : [14, 33], html: pin(p.role === "rider", on) });
      r.L.marker([p.originLat as number, p.originLng as number], { icon, title: `${p.origin} → ${p.dest}`, keyboard: true, zIndexOffset: p.mine ? 2000 : on ? 1000 : 0 })
        .on("click", () => setSel(p))
        .addTo(r.layer);
    };
    // 늘 보이는 핀: 내 글, 고른 글
    for (const p of placed) if (p.mine) pinOf(p);
    if (sel && sel.originLat != null && !sel.mine) pinOf(sel);
    if (!sc) return;
    const b = r.map.getBounds();
    const z = Math.round(r.map.getZoom());
    for (const f of sc.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], z)) {
      const [lng, lat] = f.geometry.coordinates;
      const pr = f.properties as Feat["properties"] & { cluster?: boolean; cluster_id?: number; point_count?: number };
      if (pr.cluster) {
        const n = pr.point_count ?? 0;
        const d = n < 50 ? 30 : n < 300 ? 36 : 44;
        r.L.marker([lat, lng], {
          icon: r.L.divIcon({ className: "", iconSize: [d, d], iconAnchor: [d / 2, d / 2], html: `<div style="width:${d}px;height:${d}px;border-radius:50%;background:#101B33;color:#fff;border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 6px rgba(16,27,51,.35);display:flex;align-items:center;justify-content:center;font:700 ${n < 1000 ? 13 : 12}px Pretendard,sans-serif">${n.toLocaleString("ko-KR")}</div>` }),
          title: `${n}건`,
        })
          .on("click", () => r.map.setView([lat, lng], Math.min(sc.getClusterExpansionZoom(pr.cluster_id as number), 16)))
          .addTo(r.layer);
        continue;
      }
      if (pr.id === sel?.id) continue;
      if (pr.i >= 0) {
        pinOf(placed[pr.i]);
        continue;
      }
      const id = pr.id;
      r.L.circleMarker([lat, lng], { renderer: r.canvas, radius: 5, weight: pr.r ? 2 : 1.5, color: pr.r ? BLUE : "#fff", fillColor: pr.r ? "#fff" : BLUE, fillOpacity: 0.9 })
        .on("click", async () => {
          const g = await api<{ posts: Post[] }>(`/api/posts?id=${id}`);
          if (g.ok && g.data.posts[0]) setSel(g.data.posts[0]);
        })
        .addTo(r.dots);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, indexVer, view, sel?.id]);

  // 처음 한 번: 모든 핀(또는 내 위치)이 보이게 맞춘다.
  const fitted = useRef(false);
  useEffect(() => {
    const r = refs.current;
    if (!ready || !r || fitted.current) return;
    fitted.current = true;
    // 내 글(도착지 있는 것)이 있으면 먼저 골라 둔다 — 바로 내 출퇴근길 분석이 보이게
    const own = placed.find((p) => p.mine && p.destLat != null);
    if (own && !sel) { setSel(own); return; } // 내 글 경로에 맞춰 아래에서 확대한다
    if (here) r.map.setView([here.lat, here.lng], 13);
    else if (placed.length) r.map.fitBounds(r.L.latLngBounds(placed.map((p) => [p.originLat as number, p.originLng as number] as [number, number])), { padding: [30, 30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  // 고른 글의 같은 길 회원 경로(2026-11-07 사용자 지시): 핀을 누르면 서버에서 좌표만 받아 온다
  useEffect(() => {
    setMatch(null);
    if (!sel || sel.destLat == null) return;
    let alive = true;
    api<Lines>(`/api/matches?post=${sel.id}&lines=1`).then((r) => { if (alive) setMatch(r.ok ? r.data : { lines: [], total: -1, warp: 0, fit: 0 }); });
    return () => { alive = false; };
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택한 글의 출발→도착 선 + 같은 길 회원 경로
  useEffect(() => {
    const r = refs.current;
    if (!ready || !r) return;
    r.line.clearLayers();
    if (!sel || sel.destLat == null || sel.destLng == null) return;
    const a: [number, number] = [sel.originLat as number, sel.originLng as number];
    const b: [number, number] = [sel.destLat, sel.destLng as number];
    const pts: [number, number][] = [a, b];
    for (const m of match?.lines ?? []) {
      const c = m.role === "driver" ? BLUE : GREEN;
      const op = m.timeFit ? 0.9 : 0.4;
      r.L.polyline([m.o, m.d], { color: c, weight: m.timeFit ? 3 : 2, opacity: op, dashArray: m.warp ? "4 6" : undefined }).addTo(r.line);
      r.L.circleMarker(m.o, { radius: 4, color: "#fff", weight: 1, fillColor: c, fillOpacity: op }).addTo(r.line);
      r.L.circleMarker(m.d, { radius: 3, color: c, weight: 1.5, fillColor: "#fff", fillOpacity: 1, opacity: op }).addTo(r.line);
      pts.push(m.o, m.d);
    }
    const ins = match?.insights;
    if (ins) {
      r.L.circle(b, { radius: 300, color: "#1B2433", weight: 1, dashArray: "3 4", fillColor: "#1B2433", fillOpacity: 0.06 }).addTo(r.line);
      for (const sp of ins.spots) {
        r.L.circle([sp.lat, sp.lng], { radius: 260, color: GREEN, weight: 2, fillColor: GREEN, fillOpacity: 0.18 }).addTo(r.line);
        r.L.marker([sp.lat, sp.lng], { interactive: false, icon: r.L.divIcon({ className: "", iconSize: [44, 22], iconAnchor: [22, 11],
          html: `<div style="background:${GREEN};color:#fff;border-radius:999px;font:700 12px/22px Pretendard,sans-serif;text-align:center;width:44px">${sp.n}명</div>` }) }).addTo(r.line);
        pts.push([sp.lat, sp.lng]);
      }
    }
    const mc = sel.role === "driver" ? BLUE : GREEN;
    r.L.polyline([a, b], { color: "#1B2433", weight: 6, opacity: 0.25 }).addTo(r.line);
    r.L.polyline([a, b], { color: mc, weight: 4 }).addTo(r.line);
    r.L.circleMarker(b, { radius: 7, color: "#fff", weight: 2, fillColor: "#1B2433", fillOpacity: 1 }).addTo(r.line);
    // 고르면 늘 그 글의 경로(와 같은 길 회원)가 다 보이게 맞춘다
    r.map.fitBounds(r.L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
  }, [ready, sel, match]);

  useEffect(() => {
    if (sel && !placed.some((p) => p.id === sel.id) && !pins.some((d) => d[0] === sel.id)) setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div data-block-id="C209" data-block-name="카풀 지도" className="space-y-3">
      <div className="relative isolate z-0 overflow-hidden rounded-3xl border border-line">
        <div ref={box} className="h-[340px] w-full bg-bg" role="application" aria-label={t("카풀 지도")} />
        <button type="button" data-block-id="B496" data-block-name="분석 띠" disabled={!sel}
          onClick={() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="absolute right-3 top-3 z-[500] flex min-h-0 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg disabled:cursor-default">
          <Sparkle className="h-4 w-4" />
          {!sel ? t("핀을 누르면 같은 길 분석") : !match ? t("같은 길 분석 중…") : match.total < 0 ? t("로그인하면 분석을 볼 수 있어요") : `${t("분석 결과 보기")} ↓`}
        </button>
        {touch && (
          <button type="button" data-block-id="B495" data-block-name="지도 움직이기" onClick={() => setMove((v) => !v)} aria-pressed={move}
            className={`absolute bottom-3 left-3 z-[500] min-h-0 rounded-full px-3 py-1.5 text-[13px] font-semibold shadow ${move ? "bg-brand text-white" : "bg-white text-ink"}`}>
            {move ? t("움직이기 끄기") : t("지도 움직이기")}
          </button>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-sub">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-accent" />{t("운전자입니다")}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-accent bg-white" />{t("탑승자입니다")}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-coral" />{t("내 출발지")}</span>
        <span>{t("핀은 출발지예요.")}</span>
        {shown > 0 && <span className="num">{t("지도에")} {shown.toLocaleString("ko-KR")}{t("건")}{dots.length > 0 ? ` · ${t("작은 점도 누르면 볼 수 있어요")}` : ""}</span>}
        {touch && <span>{t("두 손가락으로 확대·축소, [지도 움직이기]를 누르면 끌어서 옮길 수 있어요.")}</span>}
        {missing > 0 && <span>{t("위치 정보가 없는 글")} {missing}{t("개는 목록에서 볼 수 있어요.")}</span>}
      </p>
      {sel ? (
        <Card className="space-y-3 p-5">
          <div ref={cardRef} className="flex scroll-mt-24 items-center gap-2">
            {sel.mine && <Tag tone="warn">{t("내 글")}</Tag>}
            <Tag tone="accent">{sel.role === "driver" ? t("운전자") : t("탑승자")}</Tag>
            {sel.regular && <Tag>{t("정기카풀")}</Tag>}
            {sel.status === "progress" && <Tag tone="accent">{t("카풀 진행 중")}</Tag>}
          </div>
          <p className="text-[17px] font-semibold">{sel.origin} → {sel.dest}</p>
          <p className="num text-[14px] text-sub">{scheduleText(sel, lang)} · {sel.owner}</p>
          {sel.destLat != null && <Insight match={match} role={sel.role} />}
          <button data-block-id="B209" data-block-name="지도에서 글 보기" className={btnPrimary} onClick={() => onOpen(sel)}>{t("자세히 보기")}</button>
        </Card>
      ) : (
        placed.length > 0 && <p className="px-1 text-center text-[14px] text-sub">{t("핀을 누르면 카풀 정보를 볼 수 있어요.")}</p>
      )}
    </div>
  );
}

const FUEL_KM_L = 12; // 연비(km/L)
const WORK_DAYS = 21;
const FUEL_PRICE = 1700; // 기준 유가(원/L) — 간략 화면이라 입력칸 없이 고정(추후 보완)
/** 차 금융 종류(2026-11-10 사용자 지시: 한 달 실비 대신 월 납입금 기준으로, 간략하게) */
const FIN_TYPES = ["할부", "리스", "장기렌트"] as const;
type FinType = (typeof FIN_TYPES)[number];
function readFin(): FinType {
  try { const v = localStorage.getItem("modu.finType"); return (FIN_TYPES as readonly string[]).includes(v ?? "") ? (v as FinType) : "할부"; } catch { return "할부"; }
}
function saveStr(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 계산은 된다 */ }
}
function readNum(k: string, d: number) {
  try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : d; } catch { return d; }
}
function saveNum(k: string, v: number) {
  try { localStorage.setItem(k, String(v)); } catch { /* 저장 못 해도 계산은 된다 */ }
}

/** 핀을 고른 글의 같은 길 분석 카드(C439): ① 같은 길 수요·시간대 ③ 월 납입금 줄이기(C440) ④ 모이는 곳 ⑤ 같은 도착지 */
function Insight({ match, role }: { match: Lines | null; role: "driver" | "rider" }) {
  const t = useT();
  const [n, setN] = useState(2);
  const price = FUEL_PRICE;
  const [loan, setLoan] = useState(() => readNum("modu.loan", 0));
  const [fin, setFin] = useState<FinType>(() => readFin());
  if (!match) return <p className="rounded-2xl bg-bg px-4 py-3 text-[13px] text-sub">{t("같은 길을 분석하는 중…")}</p>;
  if (match.total < 0) return <p className="rounded-2xl bg-bg px-4 py-3 text-[13px] text-sub">{t("로그인하면 같은 길 분석을 볼 수 있어요")}</p>;
  const ins = match.insights;
  const other = role === "driver" ? t("탑승자") : t("운전자");
  const hours = ins ? Object.entries(ins.hours).map(([h, c]) => [Number(h), c] as const).sort((a, b) => a[0] - b[0]) : [];
  const maxH = Math.max(1, ...hours.map(([, c]) => c));
  const month = ins ? Math.round((ins.km * 2 * WORK_DAYS / FUEL_KM_L) * price / 1000) * 1000 : 0;
  const each = Math.round(month / (n + 1) / 1000) * 1000;
  const save = each * n;
  const won = (v: number) => `${v.toLocaleString("ko-KR")}${t("원")}`;
  const pct = loan > 0 ? Math.min(100, Math.round((save / loan) * 100)) : 0;
  return (
    <div data-block-id="C439" data-block-name="같은 길 분석" className="space-y-3">
      <div className="space-y-2 rounded-2xl bg-bg px-4 py-3 text-[13px]">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-ink"><Sparkle className="h-4 w-4 text-brand" />{t("같은 길 분석")}</p>
        {ins ? (
          <p className="text-ink">
            {t("같은 길")} <b>{t("탑승자")} {ins.riders}{t("명")}</b> · <b>{t("운전자")} {ins.drivers}{t("명")}</b>
            {match.fit > 0 && <span className="text-mint"> · {t("요일·시간 맞음")} {match.fit}{t("명")}</span>}
          </p>
        ) : <p className="text-sub">{t("아직 같은 길 회원이 없어요")}</p>}
        {hours.length > 0 && (
          <div className="space-y-1">
            <p className="text-sub">{t("같은 길")} {other} {t("출발 시각")}</p>
            <div className="flex items-end gap-1" aria-label={t("시간대별 인원")}>
              {hours.map(([h, c]) => (
                <div key={h} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                  <span className="num text-[11px] text-ink">{c}</span>
                  <span className="block w-full rounded-t bg-brand/80" style={{ height: `${Math.max(4, Math.round((c / maxH) * 44))}px` }} />
                  <span className="num text-[11px] text-sub">{h}{t("시")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-sub">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-accent" />{t("운전자 경로")}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-mint" />{t("탑승자 경로")}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-sub" />{t("워프 회원")}</span>
          <span>{t("진한 선은 요일·시간 맞음")}</span>
        </p>
      </div>

      {ins && ins.spots.length > 0 && (
        <div className="rounded-2xl bg-mintSoft px-4 py-3 text-[13px] text-ink">
          <b className="text-mint">{t("모이는 곳")} {ins.spots.length}{t("곳")}</b> · {t("같은 길 탑승자가 3명 이상 모여 사는 곳이에요(지도의 초록 원). 여기서 한 번에 태우면 돌아갈 일이 줄어요.")}
        </div>
      )}

      {ins && ins.dest.drivers + ins.dest.riders > 0 && (
        <div className="rounded-2xl bg-bg px-4 py-3 text-[13px] text-ink">
          <b>{t("같은 도착지")}</b> · {t("도착지 근처(300m)로 가는 회원")} <b>{ins.dest.drivers + ins.dest.riders}{t("명")}</b>
          <span className="text-sub"> ({t("운전자")} {ins.dest.drivers} · {t("탑승자")} {ins.dest.riders})</span>
          <span className="block text-[12px] text-sub">{t("같은 회사·건물로 출근하는 분일 수 있어요. 지도의 점선 원이에요.")}</span>
        </div>
      )}

      {ins && ins.km > 0 && (
        <div data-block-id="C440" data-block-name="월 납입금 줄이기" className="space-y-2.5 rounded-2xl border border-line bg-white px-4 py-3 text-[13px]">
          <p className="text-[14px] font-bold text-ink">{t("카풀로 내 차 월 납입금 줄이기")}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {FIN_TYPES.map((k) => (
              <button key={k} type="button" onClick={() => { setFin(k); saveStr("modu.finType", k); }} aria-pressed={fin === k}
                className={`min-h-0 rounded-full border px-3 py-1 text-[13px] ${fin === k ? "border-brand bg-brand font-semibold text-white" : "border-line bg-white text-sub"}`}>{t(k)}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sub">{t("월 납입금")}
            <input type="number" inputMode="numeric" value={loan || ""} placeholder="0" onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setLoan(v); saveNum("modu.loan", v); }}
              className="w-32 rounded-lg border border-line px-2 py-1 text-[16px] font-semibold text-ink" />{t("원")}</label>
          <div className="flex items-center gap-2">
            <span className="text-sub">{t("함께 탈 탑승자")}</span>
            {[1, 2, 3].map((k) => (
              <button key={k} type="button" onClick={() => setN(k)} aria-pressed={n === k}
                className={`min-h-0 rounded-full border px-3 py-1 text-[13px] ${n === k ? "border-brand bg-brand font-semibold text-white" : "border-line bg-white text-sub"}`}>{k}{t("명")}</button>
            ))}
          </div>
          {loan > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[15px] text-ink">{t(fin)} {t("월 납입금")} <b>{won(loan)}</b> {t("중")} <b className="text-mint">{won(save)}</b>({pct}%){t("을 카풀로 덜어요")}</p>
              <div className="h-2.5 overflow-hidden rounded-full bg-bg" aria-hidden><div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} /></div>
            </div>
          ) : (
            <p className="text-ink">{t("카풀로 한 달 약")} <b className="text-mint">{won(save)}</b>{t("을 덜 수 있어요. 월 납입금을 넣으면 몇 %인지 보여 드려요.")}</p>
          )}
          <p className="text-[12px] text-sub">{t("기름값을 나눈 실비 기준 예상치예요(영업 아님).")}</p>
        </div>
      )}
    </div>
  );
}
