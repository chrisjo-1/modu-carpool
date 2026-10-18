"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";

/** 관리자 '출퇴근 지도': 회원들의 출발→도착을 휘어진 얇은 선으로 겹쳐 그물처럼 보여 준다. */

type Role = "driver" | "rider" | "profile";
type Flow = { o: [number, number]; d: [number, number]; origin: string; dest: string; role: Role; time: string };
type RoleFilter = "all" | Role;
type TimeFilter = "all" | "early" | "7" | "8" | "late";

const COLOR: Record<Role, string> = { driver: "#2F6BFF", rider: "#12A06A", profile: "#7C3AED" };
const ROLE_NAME: Record<Role, string> = { driver: "운전자 글", rider: "탑승자 글", profile: "가입 정보만" };
const TIME_NAME: Record<TimeFilter, string> = { all: "전체 시간", early: "7시 전", "7": "7시대", "8": "8시대", late: "9시 이후" };
const SEOUL: [number, number] = [37.5665, 126.978];

function timeBand(t: string): TimeFilter | "" {
  const m = /^(\d{1,2}):/.exec(t);
  if (!m) return "";
  const h = Number(m[1]);
  return h < 7 ? "early" : h === 7 ? "7" : h === 8 ? "8" : "late";
}

/** 주소 글자에서 구(없으면 시·군) 이름을 뽑는다. 예: "서울 동대문구 장안동" → "동대문구" */
function areaOf(addr: string): string {
  const gu = /([가-힣]{1,6}구)(?=\s|$)/.exec(addr);
  if (gu) return gu[1];
  const si = /([가-힣]{1,6}(?:시|군))(?=\s|$)/.exec(addr);
  return si ? si[1] : addr.split(/\s+/).slice(0, 2).join(" ") || "기타";
}

/** 출발→도착을 살짝 휜 곡선 점들로 만든다(겹치는 직선이 한 줄로 뭉치지 않게). */
function curve(o: [number, number], d: [number, number], n = 16): [number, number][] {
  const [y1, x1] = o;
  const [y2, x2] = d;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const k = 0.18;
  const cx = mx - dy * k;
  const cy = my + dx * k;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push([a * y1 + b * cy + c * y2, a * x1 + b * cx + c * x2]);
  }
  return pts;
}

function top(items: string[], n = 5): [string, number][] {
  const m = new Map<string, number>();
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export default function FlowMap() {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<{ map: import("leaflet").Map; layer: import("leaflet").LayerGroup; L: typeof import("leaflet") } | null>(null);
  const [ready, setReady] = useState(false);
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [subway, setSubway] = useState(0);
  const [err, setErr] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [band, setBand] = useState<TimeFilter>("all");

  useEffect(() => {
    fetch("/api/admin/flows")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setErr(j.error);
        setFlows(j.flows ?? []);
        setSubway(Number(j.subway ?? 0));
      })
      .catch(() => setErr("불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    let alive = true;
    import("leaflet").then((L) => {
      if (!alive || !box.current || refs.current) return;
      const map = L.map(box.current, { zoomControl: true, preferCanvas: true }).setView(SEOUL, 10);
      // 바탕 지도는 흑백으로 옅게 해서 경로 선이 잘 보이게 한다(CSP 허용 타일: OpenStreetMap).
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap", className: "flow-tiles" }).addTo(map);
      refs.current = { map, layer: L.layerGroup().addTo(map), L };
      setReady(true);
    });
    return () => {
      alive = false;
      refs.current?.map.remove();
      refs.current = null;
    };
  }, []);

  const shown = useMemo(
    () => (flows ?? []).filter((f) => (role === "all" || f.role === role) && (band === "all" || timeBand(f.time) === band)),
    [flows, role, band],
  );

  useEffect(() => {
    const r = refs.current;
    if (!ready || !r) return;
    const { L, layer, map } = r;
    layer.clearLayers();
    const opacity = shown.length > 300 ? 0.22 : shown.length > 80 ? 0.35 : 0.55;
    for (const f of shown) {
      const line = L.polyline(curve(f.o, f.d), { color: COLOR[f.role], weight: 2, opacity, interactive: true });
      line.bindTooltip(`${f.origin} → ${f.dest}${f.time ? ` · ${f.time}` : ""} (${ROLE_NAME[f.role]})`, { sticky: true });
      layer.addLayer(line);
      layer.addLayer(L.circleMarker(f.o, { radius: 3.5, color: "#fff", weight: 1, fillColor: COLOR[f.role], fillOpacity: 0.9 }));
      layer.addLayer(L.circleMarker(f.d, { radius: 2, color: COLOR[f.role], weight: 1, fillColor: "#fff", fillOpacity: 1 }));
    }
    if (shown.length) {
      const pts = shown.flatMap((f) => [f.o, f.d]);
      map.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 13 });
    }
  }, [ready, shown]);

  const counts = useMemo(() => {
    const c: Record<Role, number> = { driver: 0, rider: 0, profile: 0 };
    for (const f of flows ?? []) c[f.role]++;
    return c;
  }, [flows]);
  const topOrigin = useMemo(() => top(shown.map((f) => areaOf(f.origin))), [shown]);
  const topDest = useMemo(() => top(shown.map((f) => areaOf(f.dest))), [shown]);
  const topPair = useMemo(() => top(shown.map((f) => `${areaOf(f.origin)} → ${areaOf(f.dest)}`)), [shown]);

  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-accent bg-accent font-semibold text-white" : "border-line bg-white text-sub"}`;

  return (
    <section className="space-y-4" data-block-id="S095" data-block-name="출퇴근 지도">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">출퇴근 지도</h2>
          <p className="text-sm text-sub">
            회원들의 출발→도착 경로를 겹쳐 보여 줍니다. 선이 많이 겹친 길일수록 진하게 보여요. 선에 마우스를 올리면 주소와 시각이 나옵니다.
          </p>
        </div>
        <p className="num text-sm text-sub">
          경로 <b className="text-ink">{shown.length.toLocaleString()}</b>
          {flows && shown.length !== flows.length ? ` / ${flows.length.toLocaleString()}` : ""}개 · 지하철 등록 {subway.toLocaleString()}명(좌표 없음)
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="역할로 거르기">
        {(["all", "driver", "rider", "profile"] as RoleFilter[]).map((v) => (
          <button key={v} type="button" aria-pressed={role === v} className={chip(role === v)} onClick={() => setRole(v)}>
            {v !== "all" && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COLOR[v as Role] }} />}
            {v === "all" ? "전체" : ROLE_NAME[v as Role]} <span className="num opacity-80">{v === "all" ? (flows?.length ?? 0) : counts[v as Role]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="출발 시간대로 거르기">
        {(["all", "early", "7", "8", "late"] as TimeFilter[]).map((v) => (
          <button key={v} type="button" aria-pressed={band === v} className={chip(band === v)} onClick={() => setBand(v)}>
            {TIME_NAME[v]}
          </button>
        ))}
      </div>

      {err && <p className="rounded-xl bg-warnSoft px-4 py-3 text-sm text-warn">{err}</p>}
      <style>{`.flow-tiles{filter:grayscale(1) brightness(1.08) contrast(.85)}`}</style>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div ref={box} className="h-[min(70vh,620px)] w-full" aria-label="출퇴근 경로 지도" />
        {flows === null && !err && <p className="absolute inset-x-0 top-3 text-center text-sm text-sub">불러오는 중…</p>}
        {flows && flows.length === 0 && <p className="absolute inset-x-0 top-3 text-center text-sm text-sub">아직 좌표가 있는 출퇴근 경로가 없습니다.</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["많이 출발하는 곳", topOrigin],
          ["많이 도착하는 곳", topDest],
          ["많은 구간", topPair],
        ].map(([title, rows]) => (
          <div key={title as string} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="text-sm font-semibold">{title as string}</p>
            {(rows as [string, number][]).length === 0 ? (
              <p className="mt-2 text-sm text-sub">자료 없음</p>
            ) : (
              <ol className="mt-2 space-y-1 text-sm">
                {(rows as [string, number][]).map(([k, n], i) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="num mr-1.5 text-sub">{i + 1}</span>
                      {k}
                    </span>
                    <b className="num shrink-0">{n}</b>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-sub">진행 중인 정기(출퇴근) 카풀 글 + 정기 글이 없는 회원의 가입 출퇴근 정보. 차단·탈퇴·테스트 회원 제외. 이름·이메일은 담지 않습니다.</p>
    </section>
  );
}
