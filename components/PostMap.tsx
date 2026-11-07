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
  const [match, setMatch] = useState<Lines | null>(null);
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
    // 내 글(도착지 있는 것)이 있으면 먼저 골라 둔다 — 바로 내 출퇴근길 분석이 보이게
    const own = placed.find((p) => p.mine && p.destLat != null);
    if (own && !sel) setSel(own);
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
    if (match?.lines.length || match?.insights?.spots.length) r.map.fitBounds(r.L.latLngBounds(pts), { padding: [30, 30], maxZoom: 14 });
  }, [ready, sel, match]);

  useEffect(() => {
    if (sel && !placed.some((p) => p.id === sel.id)) setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div data-block-id="C209" data-block-name="카풀 지도" className="space-y-3">
      <div className="relative isolate z-0 overflow-hidden rounded-3xl border border-line">
        <div ref={box} className="h-[420px] w-full bg-bg" role="application" aria-label={t("카풀 지도")} />
        <div data-block-id="C440" data-block-name="분석 띠" className="pointer-events-none absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg">
          <Sparkle className="h-4 w-4" />{sel ? t("같은 길 분석 중") : t("핀을 누르면 같은 길 분석")}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-sub">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-accent" />{t("운전자입니다")}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-accent bg-white" />{t("탑승자입니다")}</span>
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
          {sel.destLat != null && <Insight match={match} role={sel.role} />}
          <button data-block-id="B209" data-block-name="지도에서 글 보기" className={btnPrimary} onClick={() => onOpen(sel)}>{t("자세히 보기")}</button>
        </Card>
      ) : (
        placed.length > 0 && <p className="px-1 text-center text-[14px] text-sub">{t("핀을 누르면 카풀 정보를 볼 수 있어요.")}</p>
      )}
    </div>
  );
}

const FUEL_KM_L = 12; // 연비(km/L) — 화면에 함께 적는다
const WORK_DAYS = 21;
function readNum(k: string, d: number) {
  try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : d; } catch { return d; }
}
function saveNum(k: string, v: number) {
  try { localStorage.setItem(k, String(v)); } catch { /* 저장 못 해도 계산은 된다 */ }
}

/** 핀을 고른 글의 같은 길 분석 카드(C439): ① 같은 길 수요·시간대 ③ 한 달 실비 ④ 모이는 곳 ⑤ 같은 도착지 */
function Insight({ match, role }: { match: Lines | null; role: "driver" | "rider" }) {
  const t = useT();
  const [n, setN] = useState(2);
  const [price, setPrice] = useState(() => readNum("modu.fuelPrice", 1700));
  const [loan, setLoan] = useState(() => readNum("modu.loan", 0));
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
        <div className="space-y-2 rounded-2xl border border-line bg-white px-4 py-3 text-[13px]">
          <p className="text-[14px] font-bold text-ink">{t("이 길로 카풀하면 한 달 실비")}</p>
          <p className="text-sub">{t("예상 거리")} {ins.km}km · {t("왕복")} × {t("월")} {WORK_DAYS}{t("일")} · {t("연비")} {FUEL_KM_L}km/L</p>
          <div className="flex items-center gap-2">
            <span className="text-sub">{t("함께 탈 탑승자")}</span>
            {[1, 2, 3].map((k) => (
              <button key={k} type="button" onClick={() => setN(k)} aria-pressed={n === k}
                className={`min-h-0 rounded-full border px-3 py-1 text-[13px] ${n === k ? "border-brand bg-brand font-semibold text-white" : "border-line bg-white text-sub"}`}>{k}{t("명")}</button>
            ))}
          </div>
          <p className="text-ink">{t("한 달 기름값 약")} <b>{won(month)}</b> → {t("1인 분담")} <b className="text-mint">{won(each)}</b></p>
          <p className="text-ink">{t("운전자는 한 달")} <b className="text-accent">{won(save)}</b> {t("실비를 나눠요")}</p>
          <div className="flex flex-wrap items-center gap-2 text-sub">
            <label className="flex items-center gap-1">{t("기준 유가")}
              <input type="number" inputMode="numeric" value={price} onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setPrice(v); saveNum("modu.fuelPrice", v); }}
                className="w-20 rounded-lg border border-line px-2 py-1 text-[16px] text-ink" />{t("원/L")}</label>
            <label className="flex items-center gap-1">{t("월 할부금")}
              <input type="number" inputMode="numeric" value={loan || ""} placeholder="0" onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setLoan(v); saveNum("modu.loan", v); }}
                className="w-24 rounded-lg border border-line px-2 py-1 text-[16px] text-ink" />{t("원")}</label>
          </div>
          {loan > 0 && save > 0 && <p className="font-semibold text-brand">{t("차 할부금의")} {Math.min(100, Math.round((save / loan) * 100))}% {t("를 카풀 실비 분담으로 덜 수 있어요")}</p>}
          <p className="text-[12px] text-sub">{t("통행료·주차비는 빠진 예상치예요. 영업이 아니라 실제 든 비용을 나누는 금액이에요.")}</p>
        </div>
      )}
    </div>
  );
}
