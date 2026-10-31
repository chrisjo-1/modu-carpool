"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import NotifyModal, { type NotifyTarget } from "./NotifyModal";
import type { MapPoint } from "./PairMap";

const PairMap = dynamic(() => import("./PairMap"), { ssr: false });

type Stats = { total: number; drivers: number; geo: number; geoWait: number; geoFail: number; moved: number; bad: number; linked: number; inLegacy: number; modoPosts: number };
type Row = { code: string; active: boolean; role: "driver" | "rider"; home: string; work: string; region: string; timeGo: string; timeBack: string; warpId: string; regDate: string; geo: boolean; tried: boolean; moved: boolean; short: string; dup: number; userId: string | null; name: string; withdrawn: boolean; hasMail: boolean; bad: boolean; live: boolean; homeShort: string; workShort: string; homeArea: string; workArea: string };
type Member = Point & { homeKm: number; workKm: number; sumKm: number; chance: number; distPct: number; routePct: number | null; onRoute: boolean; goDiff: number | null; backDiff: number | null; detourKm: number | null };
type Pair = { driver: Point; rider: Member };
type Group = { driver: Point; riders: Member[]; best: number };
type Point = { kind: "warp" | "post"; ref: string; role: "driver" | "rider"; home: string; work: string; timeGo: string; timeBack: string; warpId: string; userId: string | null; name: string; live: boolean; homeKm?: number; workKm?: number;
  homeShort: string; workShort: string; homeArea: string; workArea: string;
  homeLat: number | null; homeLng: number | null; workLat: number | null; workLng: number | null };
type Regions = { from: Record<string, Record<string, number>>; to: Record<string, Record<string, number>> };
type Sort = "score" | "sum" | "detour" | "route" | "time";
const SORT_NAME: Record<Sort, string> = { score: "종합 가능성 높은 순", sum: "출발지+도착지 거리 합 순", detour: "돌아가는 거리 짧은 순", route: "경로 일치율 높은 순", time: "출근 시간 차 작은 순" };
const SIDO_ORDER = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
type Workplace = { place: string; n: number; drivers: number; riders: number; members: Point[] };

const input = "w-full rounded-xl border border-line bg-white px-4 py-2.5 text-[15px]";
const ROLE = { driver: "운전자", rider: "탑승자" } as const;
const liveChip = <span className="rounded bg-mintSoft px-1.5 text-xs font-semibold text-mint">바로 연락 가능</span>;
/** 앱 카드와 같은 장소 표시: 굵은 짧은 이름 + 아래 작은 회색 지역 글씨. 원래 주소는 눌러 두면(title) 보인다. */
function Places({ p, size = "md" }: { p: { home: string; work: string; homeShort: string; workShort: string; homeArea: string; workArea: string }; size?: "md" | "sm" }) {
  const big = size === "md" ? "text-[15px]" : "text-sm";
  const one = (name: string, area: string, full: string, filled: boolean) => (
    <p className="relative min-w-0 pl-[18px]" title={full}>
      <span aria-hidden className={`absolute left-0 top-[0.45em] h-2.5 w-2.5 rounded-full ${filled ? "bg-accent" : "border-2 border-accent bg-white"}`} />
      <span className={`block truncate font-semibold ${big}`}>{name || <span className="font-normal text-sub">(목적지 없음)</span>}</span>
      {area && <span className="block truncate text-[12px] leading-tight text-sub">{area}</span>}
    </p>
  );
  return (
    <div className="min-w-0 space-y-1">
      {one(p.homeShort || p.home, p.homeArea, p.home, false)}
      {one(p.workShort || p.work, p.workArea, p.work, true)}
    </div>
  );
}

/** 가로 막대 한 줄(점수 0~100) */
function Bar({ label, v, color }: { label: string; v: number | null; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-sub">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg"><span className={`block h-full rounded-full ${color}`} style={{ width: `${v ?? 0}%` }} /></span>
      <span className="num w-9 shrink-0 text-right font-semibold">{v == null ? "-" : `${v}%`}</span>
    </div>
  );
}

const roleChip = (r: "driver" | "rider") => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${r === "driver" ? "bg-accent" : "bg-mint"}`}>{ROLE[r]}</span>;

/**
 * 관리자 > 카풀 > 정기 매칭(S413). 워프 정기카풀을 붙여넣어 저장하고, 거리로만 매칭 후보를 찾는다(시간은 추후).
 * 이 화면에서만 매칭자를 검색한다. 전화번호는 [번호 보기]로만(기록 남음), 연락은 [알림]으로 그 회원에게만.
 */
export default function WarpPools() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [noGeo, setNoGeo] = useState(false);
  const [geoOk, setGeoOk] = useState(false);
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [pubF, setPubF] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cost, setCost] = useState<"free" | "fixed">("free");
  const [price, setPrice] = useState("");
  const [pubMsg, setPubMsg] = useState("");
  const [pubBusy, setPubBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(true);
  const [dupInfo, setDupInfo] = useState<{ existing: string[]; changed: string[]; dupInPaste: string[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [geoRun, setGeoRun] = useState(false);
  const geoStop = useRef(false);
  const geoT0 = useRef(0);
  const [base, setBase] = useState<Row | null>(null);
  const [radius, setRadius] = useState(3);
  const [opp, setOpp] = useState(true);
  const [cands, setCands] = useState<Point[] | null>(null);
  const [candMsg, setCandMsg] = useState("");
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [notify, setNotify] = useState<NotifyTarget | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [view, setView] = useState<"groups" | "pairs">("groups");
  const [gInfo, setGInfo] = useState({ drivers: 0, riders: 0 });
  const [gRadius, setGRadius] = useState(3);
  const [gShow, setGShow] = useState(20);
  const [tolGo, setTolGo] = useState(30);
  const [tolBack, setTolBack] = useState(60);
  const [timeOnly, setTimeOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("score");
  const [rf, setRf] = useState({ from: "", fromGu: "", to: "", toGu: "" });
  const [regions, setRegions] = useState<Regions | null>(null);
  const [mapFor, setMapFor] = useState<{ driver: MapPoint; riders: MapPoint[] } | null>(null);
  const [geoLast, setGeoLast] = useState<{ found: number; failed: number; done: number } | null>(null);
  const [liveFirst, setLiveFirst] = useState(true);
  const [liveOnlyM, setLiveOnlyM] = useState(false);
  const [liveOnly, setLiveOnly] = useState(false);
  const [badOnly, setBadOnly] = useState(false);
  const [wps, setWps] = useState<Workplace[] | null>(null);
  const [wpInfo, setWpInfo] = useState({ total: 0, noDriver: 0 });
  const [wpMin, setWpMin] = useState(3);
  const [wpNoDriver, setWpNoDriver] = useState(false);
  const [wpShow, setWpShow] = useState(20);
  const loadWps = useCallback(async (min: number) => {
    setWps(null);
    const res = await fetch(`/api/admin/warp-pools?workplaces=1&min=${min}`);
    const j = await res.json().catch(() => ({}));
    setWps(res.ok ? j.list ?? [] : []);
    if (res.ok) setWpInfo({ total: j.total ?? 0, noDriver: j.noDriver ?? 0 });
    setWpShow(20);
  }, []);
  const loadGroups = useCallback(async () => {
    setGroups(null);
    setPairs(null);
    const p = new URLSearchParams({ groups: "1", r: String(gRadius), sort, ...Object.fromEntries(Object.entries(rf).filter(([, v]) => v)), ...(view === "pairs" ? { pairs: "1" } : {}) });
    const res = await fetch(`/api/admin/warp-pools?${p}`);
    const j = await res.json().catch(() => ({}));
    setGroups(res.ok ? j.groups ?? [] : []);
    setPairs(res.ok ? j.pairs ?? [] : []);
    if (res.ok) {
      setGInfo({ drivers: j.drivers ?? 0, riders: j.riders ?? 0 });
      setRegions(j.regions ?? null);
    }
    setGShow(20);
  }, [gRadius, sort, rf, view]);
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);
  const mp = (p: Point, label: string): MapPoint => ({ role: p.role, label, homeShort: p.homeShort, workShort: p.workShort, homeLat: p.homeLat, homeLng: p.homeLng, workLat: p.workLat, workLng: p.workLng });
  const who = (p: Point) => `${p.warpId || (p.kind === "warp" ? "고유번호 없음" : "")}${p.name ? ` · ${p.name}` : ""}`;
  const MapBtn = ({ d, rs }: { d: Point; rs: Point[] }) => (
    <button data-block-id="B455" data-block-name="매칭 지도 보기" className="min-h-0 rounded-lg border border-accent bg-white px-2.5 py-1 text-xs font-bold text-accent"
      onClick={() => setMapFor({ driver: mp(d, who(d)), riders: rs.map((r) => mp(r, who(r))) })}>지도</button>
  );
  /** 종합 가능성 = 거리 점수 50% + 경로 일치율 50%(시간은 따로) */
  const Score = ({ m, big = false }: { m: Member; big?: boolean }) => (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`num rounded-full bg-accent px-2.5 py-0.5 font-bold text-white ${big ? "text-base" : "text-sm"}`}>{m.chance}%</span>
        {m.onRoute && <span className="rounded bg-accentSoft px-1.5 text-xs font-semibold text-accent">가는 길 위</span>}
        <TimeBadge m={m} />
      </div>
      <Bar label="거리" v={m.distPct} color="bg-accent" />
      <Bar label="경로 일치" v={m.routePct} color="bg-mint" />
    </div>
  );
  /** 시간 조건(점수와 별개): 출근·퇴근 차가 허용 폭 안이면 맞음. 시간이 비어 있으면 '확인 불가'. */
  const timeOk = (m: Member) => m.goDiff != null && m.goDiff <= tolGo && (m.backDiff == null || m.backDiff <= tolBack);
  const TimeBadge = ({ m }: { m: Member }) =>
    m.goDiff == null ? <span className="rounded bg-bg px-1.5 text-xs text-sub">시간 확인 불가</span>
    : timeOk(m) ? <span className="rounded bg-mintSoft px-1.5 text-xs font-semibold text-mint">시간 맞음 ✓</span>
    : <span className="rounded bg-warnSoft px-1.5 text-xs font-semibold text-warn">출근 {m.goDiff}분{m.backDiff != null ? ` · 퇴근 ${m.backDiff}분` : ""} 차</span>;
  const Dist = ({ m }: { m: Member }) => (
    <span className="num text-xs text-sub">출발지 {m.homeKm}km · 도착지 {m.workKm >= 0 ? `${m.workKm}km` : "비교 안 함"} (합 <b className="text-ink">{m.sumKm}km</b>)
      {m.detourKm != null && <> · 돌아감 <b className="text-ink">+{m.detourKm}km</b></>}</span>
  );
  /** 활동 회원(비밀번호를 정했거나 30일 안 접속) 먼저 — 같은 묶음 안에서는 원래 순서 유지 */
  const liveRank = (live: boolean) => (liveFirst && !live ? 1 : 0);
  const shownGroups = (groups ?? [])
    .filter((g) => !timeOnly || g.riders.some(timeOk))
    .filter((g) => !liveOnlyM || g.driver.live || g.riders.some((r) => r.live))
    .map((g, i) => ({ g, i }))
    .sort((a, b) => liveRank(a.g.driver.live || a.g.riders.some((r) => r.live)) - liveRank(b.g.driver.live || b.g.riders.some((r) => r.live)) || a.i - b.i)
    .map((x) => x.g);
  const shownPairs = (pairs ?? [])
    .filter((x) => !timeOnly || timeOk(x.rider))
    .filter((x) => !liveOnlyM || x.driver.live || x.rider.live)
    .map((x, i) => ({ x, i }))
    .sort((a, b) => liveRank(a.x.driver.live || a.x.rider.live) - liveRank(b.x.driver.live || b.x.rider.live) || a.i - b.i)
    .map((y) => y.x);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ q, role, pub: pubF, ...(noGeo ? { geo: "none" } : geoOk ? { geo: "ok" } : {}), ...(linkedOnly ? { linked: "1" } : {}), ...(liveOnly ? { live: "1" } : {}), ...(badOnly ? { bad: "1" } : {}), ...Object.fromEntries(Object.entries(rf).filter(([, v]) => v)) });
    const r = await fetch(`/api/admin/warp-pools?${p}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setStats(j.stats);
      setRows(j.list ?? []);
    }
  }, [q, role, noGeo, geoOk, linkedOnly, pubF, liveOnly, badOnly, rf]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const upload = async () => {
    if (!paste.trim()) return;
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/warp-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "upload", text: paste }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했어요.");
    setMsg(`읽음 ${j.read}건 → 새로 저장 ${j.added}건 · 이미 있던 글 ${(j.existing ?? []).length}건(그중 내용 바뀜 ${j.updated}건)${(j.dupInPaste ?? []).length ? ` · 붙여넣은 글 안에서 겹침 ${j.dupInPaste.length}건` : ""}${j.skipped ? ` · 읽지 못함 ${j.skipped}건` : ""}. 이어서 위치를 채워요.`);
    setDupInfo({ existing: j.existing ?? [], changed: j.changed ?? [], dupInPaste: j.dupInPaste ?? [] });
    setPaste("");
    setShowPaste(false);
    await load();
    fillGeo();
  };

  // 위치 채우기: 한 번에 약 40초씩, 남은 게 없거나 멈출 때까지 이어서
  const fillGeo = async () => {
    if (geoRun) return;
    setGeoRun(true);
    geoStop.current = false;
    const sum = { found: 0, failed: 0, done: 0 };
    geoT0.current = Date.now();
    setGeoLast({ ...sum });
    for (let i = 0; i < 400 && !geoStop.current; i++) {
      const r = await fetch("/api/admin/warp-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "geo" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error ?? "위치 채우기 중 오류가 났어요.");
        break;
      }
      sum.found += j.found ?? 0;
      sum.failed += j.failed ?? 0;
      sum.done += j.done ?? 0;
      setGeoLast({ ...sum });
      await load();
      if (!j.left) break;
    }
    setGeoRun(false);
    loadGroups();
  };

  const findCands = async (b: Row | null = base, r = radius, o = opp) => {
    if (!b) return;
    setCands(null);
    setCandMsg("");
    const res = await fetch(`/api/admin/warp-pools?match=${encodeURIComponent(b.code)}&r=${r}&opp=${o ? 1 : 0}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setCandMsg(j.error ?? "찾지 못했어요.");
    if (j.noGeo) return setCandMsg("이 글은 아직 위치를 못 찾아서 거리를 잴 수 없어요. [위치 채우기]를 먼저 해 주세요.");
    setCands(j.list ?? []);
  };
  const pickBase = (r: Row) => {
    setBase(r);
    findCands(r);
    setTimeout(() => document.getElementById("pool-cands")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const showPhone = async (key: string, warpId: string, userId: string | null) => {
    const r = await fetch("/api/admin/warp-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "phone", warpId, userId }) });
    const j = await r.json().catch(() => ({}));
    setPhones((p) => ({ ...p, [key]: r.ok ? j.phone || "번호 없음" : j.error ?? "확인 불가" }));
  };

  const canPublish = (r: Row) => !!r.userId && r.active && !!r.work && !r.bad && r.geo && !r.moved && !r.withdrawn;
  const toggle = (code: string) => setSel((s0) => { const n = new Set(s0); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const doPublish = async (action: "publish" | "unpublish", codes: string[]) => {
    if (!codes.length) return;
    setPubBusy(true);
    setPubMsg("");
    const r = await fetch("/api/admin/warp-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, codes, cost, price: Number(price) || 0 }) });
    const j = await r.json().catch(() => ({}));
    setPubBusy(false);
    if (!r.ok) return setPubMsg(j.error ?? "처리하지 못했어요.");
    if (action === "publish") {
      const why = (j.skipped ?? []).reduce((m: Record<string, number>, x: { why: string }) => ({ ...m, [x.why]: (m[x.why] ?? 0) + 1 }), {});
      setPubMsg(`정기카풀로 올림 ${j.posted}건${Object.keys(why).length ? ` · 건너뜀: ${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}`);
    } else setPubMsg(`내림: 삭제 ${j.removed}건${j.closed ? ` · 신청이 있어 마감 ${j.closed}건` : ""}`);
    setSel(new Set());
    load();
    loadGroups();
  };

  const PersonActions = ({ k, warpId, userId, label, canMail }: { k: string; warpId: string; userId: string | null; label: string; canMail: boolean }) => (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      {phones[k] ? <span className="num font-semibold">{phones[k]}</span> : (
        <button data-block-id="B436" data-block-name="전화번호 보기" className="min-h-0 text-accent underline" onClick={() => showPhone(k, warpId, userId)}>번호 보기</button>
      )}
      {(userId || canMail) && (
        <button data-block-id="B437" data-block-name="이 회원에게 알림" className="min-h-0 font-semibold text-accent underline" onClick={() => setNotify({ userId, warpId, label })}>알림</button>
      )}
    </span>
  );

  return (
    <section data-block-id="S413" data-block-name="정기 매칭" className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">워프 정기카풀 · 거리 매칭</h2>
          <div className="flex flex-wrap gap-2">
            <button data-block-id="B438" data-block-name="워프 목록 붙여넣기" className="min-h-0 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white" onClick={() => setShowPaste((v) => !v)}>목록 붙여넣기</button>
            <button data-block-id="B439" data-block-name="위치 채우기" className="min-h-0 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold" onClick={() => (geoRun ? (geoStop.current = true) : fillGeo())}>{geoRun ? "위치 채우는 중… (멈추기)" : "위치 채우기"}</button>
            <a data-block-id="B440" data-block-name="엑셀 내려받기" href="/api/admin/warp-pools?csv=1" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold">엑셀(CSV) 내려받기</a>
          </div>
        </div>
        <p className="mt-1 text-sm text-sub">① 워프 목록 붙여넣기 → ② 위치 채우기(주소를 지도 좌표로) → ③ 아래 매칭에서 가능성 높은 쌍 확인 → ④ [번호 보기]·[알림]으로 연결. 모두의카풀 진행 중 정기카풀 글도 함께 매칭돼요. 이 화면에서만 볼 수 있어요.</p>
        {showPaste && (
          <div className="mt-3">
            <label data-block-id="B445" data-block-name="워프 정기카풀 파일 올리기" className="mb-2 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-accent bg-accentSoft px-4 py-3 text-sm font-semibold text-accent">
              텍스트 파일로 올리기 (.txt · .csv, 여러 개 한 번에)
              <input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" multiple className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  const texts = await Promise.all(files.map((f) => f.text()));
                  setPaste((p) => [p, ...texts].filter((x) => x.trim()).join("\n\n"));
                  setMsg(`파일 ${files.length}개를 읽었어요. 아래 [저장하기]를 눌러 주세요.`);
                  e.target.value = "";
                }} />
            </label>
            <textarea data-block-id="F423" data-block-name="워프 정기카풀 붙여넣기" className={`${input} h-48 font-mono text-xs`} placeholder={"워프 관리자 화면의 정기카풀 목록을 그대로 복사해 붙여 주세요.\n(코드·사용·역할·자택·회사·지역·출근·퇴근·회원 고유번호·등록일, 엑셀에서 복사한 표도 돼요)"} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button data-block-id="B441" data-block-name="워프 정기카풀 저장" disabled={busy || !paste.trim()} className="mt-2 min-h-0 w-full rounded-xl bg-accent py-3 font-bold text-white disabled:opacity-50" onClick={upload}>{busy ? "저장 중…" : "저장하기 (같은 코드는 새 내용으로)"}</button>
          </div>
        )}
        {msg && <p className="mt-2 rounded-xl bg-accentSoft px-3 py-2 text-sm">{msg}</p>}
        {dupInfo && (dupInfo.existing.length > 0 || dupInfo.dupInPaste.length > 0) && (
          <details data-block-id="C422" data-block-name="중복 목록" className="mt-2 rounded-xl border border-line px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold">중복 목록 보기</summary>
            {dupInfo.dupInPaste.length > 0 && <p className="mt-2"><b>붙여넣은 글 안에서 겹침 {dupInfo.dupInPaste.length}건</b> (마지막 것으로 저장): <span className="num break-all text-sub">{dupInfo.dupInPaste.join(", ")}</span></p>}
            {dupInfo.changed.length > 0 && <p className="mt-2"><b>이미 있던 글 · 내용 바뀜 {dupInfo.changed.length}건</b> (새 내용으로 바꿈): <span className="num break-all text-sub">{dupInfo.changed.join(", ")}</span></p>}
            {dupInfo.existing.length > dupInfo.changed.length && <p className="mt-2"><b>이미 있던 글 · 내용 같음 {dupInfo.existing.length - dupInfo.changed.length}건</b>: <span className="num break-all text-sub">{dupInfo.existing.filter((c) => !dupInfo.changed.includes(c)).join(", ")}</span></p>}
          </details>
        )}
        {stats && (() => {
          const need = stats.geo + stats.geoWait + stats.geoFail;
          const pct = need ? Math.round((100 * stats.geo) / need) : 0;
          // 남은 시간: 이번 실행에서 실제로 처리한 속도로 계산(아직 모르면 표시 안 함)
          const perMin = geoRun && geoLast && geoLast.done > 0 ? geoLast.done / Math.max(0.5, (Date.now() - geoT0.current) / 60000) : 0;
          const mins = perMin ? Math.ceil(stats.geoWait / perMin) : 0;
          return (
            <div data-block-id="C423" data-block-name="위치 채우기 진행" className="mt-3 rounded-xl border border-line px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>위치 채우기 {geoRun ? <span className="font-normal text-accent">· 진행 중</span> : stats.geoWait ? <span className="font-normal text-sub">· 멈춤</span> : <span className="font-normal text-mint">· 끝남</span>}</b>
                <span className="num text-xs text-sub">좌표 찾음 {stats.geo} / {need}건 ({pct}%) · 남은 {stats.geoWait}건{stats.geoWait && mins ? ` (약 ${mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`})` : ""} · 못 찾음 {stats.geoFail}건</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1.5 text-xs text-sub">주소 글자를 지도 좌표(위도·경도)로 바꾸는 작업이에요. <b className="text-ink">좌표가 있는 글만 거리 매칭·지도에 들어가요.</b> 무료 지도(OSM)는 1초에 1번만 물을 수 있어 오래 걸려요. 이 화면을 열어 둔 동안만 돌고, 닫으면 멈췄다가 다시 누르면 이어서 해요. 카카오맵을 켜면(Kakao Developers › 카카오맵 ON) 몇 분 안에 끝나요.{geoLast ? ` 이번 실행: 찾음 ${geoLast.found} · 못 찾음 ${geoLast.failed}.` : ""}</p>
            </div>
          );
        })()}
        {stats && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["저장된 워프 정기카풀", `${stats.total}건 (운전자 ${stats.drivers})`],
              ["위치 찾음", `${stats.geo}건${stats.geoWait ? ` · 대기 ${stats.geoWait}` : ""}${stats.geoFail ? ` · 못 찾음 ${stats.geoFail}` : ""}`],
              ["모두의카풀 계정 연결", `${stats.linked}명 · 정기카풀로 올림 ${stats.moved}`],
              ["모두의카풀 정기 글(위치 있음)", `${stats.modoPosts}건`],
              ...(stats.bad ? [["주소 확인 필요(자택=회사)", `${stats.bad}건 · 매칭 제외`]] : []),
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-bg px-3 py-2"><p className="text-xs text-sub">{a}</p><p className="num font-bold">{b}</p></div>
            ))}
          </div>
        )}
        {stats && stats.total > stats.inLegacy && <p className="mt-2 text-xs text-sub">워프 회원 명단에 없는 고유번호 {stats.total - stats.inLegacy}건은 번호·메일을 알 수 없어요(구 워프 이전 탭에 명단을 올리면 연결돼요).</p>}
      </div>

      <div data-block-id="S417" data-block-name="매칭 묶음" className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">매칭</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(["groups", "pairs"] as const).map((v) => (
              <button key={v} data-block-id="B451" data-block-name="매칭 보기 바꾸기" className={`min-h-0 rounded-full border px-3 py-1 font-semibold ${view === v ? "border-accent bg-accent text-white" : "border-line bg-white"}`}
                onClick={() => setView(v)}>{v === "groups" ? "운전자별 묶음" : "전체 쌍"}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <label className="flex items-center gap-2"><span className="w-12 shrink-0 text-sub">정렬</span>
            <select data-block-id="F437" data-block-name="매칭 정렬" className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {(Object.keys(SORT_NAME) as Sort[]).map((k) => <option key={k} value={k}>{SORT_NAME[k]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="w-12 shrink-0 text-sub">반경</span>
            <select data-block-id="F427" data-block-name="묶음 반경" className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5" value={gRadius} onChange={(e) => setGRadius(Number(e.target.value))}>
              {[1, 2, 3, 5, 10].map((r) => <option key={r} value={r}>{r}km</option>)}
            </select>
          </label>
          {(["from", "to"] as const).map((side) => {
            const gu = side === "from" ? "fromGu" : "toGu";
            const counts = regions?.[side] ?? {};
            const sidos = SIDO_ORDER.filter((x) => counts[x]);
            const gus = rf[side] ? Object.entries(counts[rf[side]] ?? {}).filter(([k]) => k).sort((a, b) => b[1] - a[1]) : [];
            return (
              <div key={side} data-block-id={side === "from" ? "F438" : "F439"} data-block-name={side === "from" ? "출발 지역" : "도착 지역"} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-sub">{side === "from" ? "출발" : "도착"}</span>
                <select className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5" value={rf[side]} onChange={(e) => setRf((o) => ({ ...o, [side]: e.target.value, [gu]: "" }))}>
                  <option value="">전체 시·도</option>
                  {sidos.map((x) => <option key={x} value={x}>{x} ({counts[x][""]})</option>)}
                </select>
                <select className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-1.5 disabled:opacity-50" disabled={!rf[side]} value={rf[gu]} onChange={(e) => setRf((o) => ({ ...o, [gu]: e.target.value }))}>
                  <option value="">전체 시·군·구</option>
                  {gus.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
                </select>
              </div>
            );
          })}
        </div>
        <div data-block-id="F431" data-block-name="시간 조건" className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-bg px-3 py-2 text-sm">
          <b>시간 조건(점수와 별개)</b>
          <label className="flex items-center gap-1">출근 ±<input type="number" min={0} max={240} step={10} className="w-16 rounded border border-line bg-white px-1.5 py-0.5" value={tolGo} onChange={(e) => setTolGo(Number(e.target.value) || 0)} />분</label>
          <label className="flex items-center gap-1">퇴근 ±<input type="number" min={0} max={240} step={10} className="w-16 rounded border border-line bg-white px-1.5 py-0.5" value={tolBack} onChange={(e) => setTolBack(Number(e.target.value) || 0)} />분</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={timeOnly} onChange={(e) => setTimeOnly(e.target.checked)} />시간 맞는 것만</label>
          <span data-block-id="F432" data-block-name="활동 회원 우선" className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1"><input type="checkbox" checked={liveFirst} onChange={(e) => setLiveFirst(e.target.checked)} />바로 연락 가능한 회원 먼저</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={liveOnlyM} onChange={(e) => setLiveOnlyM(e.target.checked)} />바로 연락 가능만</label>
          </span>
        </div>
        <details className="mt-2 text-xs text-sub">
          <summary className="cursor-pointer font-semibold">가능성은 이렇게 계산해요</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li><b className="text-ink">종합 가능성</b> = 거리 점수 50% + 경로 일치율 50%. 시간은 점수에 넣지 않고 따로 &quot;시간 맞음/○분 차&quot;로 보여요.</li>
            <li><b className="text-ink">거리</b>: 출발지끼리 + 도착지끼리 거리 합이 0km면 100%, 둘 다 반경 끝이면 0%. &apos;가는 길 위&apos; 후보는 돌아가는 거리로 잼(0km = 100%, 반경 = 0%).</li>
            <li><b className="text-ink">경로 일치</b>: 탑승자가 가는 길(집→회사) 중 운전자 길과 겹치는 비율. 옆으로 떨어진 만큼 깎고, 반대 방향이면 0%.</li>
            <li><b className="text-ink">돌아감</b>: 운전자가 탑승자 집·회사를 들렀다 갈 때 더 가는 거리. <b className="text-ink">가는 길 위</b> = 집·회사는 반경 밖이지만 돌아가는 거리가 반경 안인 후보.</li>
            <li>직선 거리로 계산해요(실제 도로와 다를 수 있어요). [지도]로 확인하세요. 자택·회사 주소가 같은 글은 빼요. 바로 연락 가능 = 비밀번호를 정했거나 30일 안에 접속한 회원.</li>
          </ul>
        </details>
        <p className="mt-1 text-xs text-sub">위치를 찾은 운전자 {gInfo.drivers}명 · 탑승자 {gInfo.riders}명 기준{view === "groups" ? ` · 묶음 ${shownGroups.length}개` : ` · 쌍 ${shownPairs.length}개`}</p>
        {view === "groups" && groups === null && <p className="py-6 text-center text-sub">계산 중…</p>}
        {view === "groups" && groups && groups.length === 0 && <p className="py-6 text-center text-sub">조건에 맞는 운전자·탑승자가 없어요. 위치 채우기가 끝났는지 확인하거나 반경·지역을 넓혀 보세요.</p>}
        {view === "groups" && <ol className="mt-3 space-y-3">
          {shownGroups.slice(0, gShow).map((g, i) => {
            const d = g.driver;
            const rs = g.riders.filter((r) => !timeOnly || timeOk(r));
            return (
              <li key={`${d.kind}:${d.ref}`} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="num w-6 text-sub">{i + 1}</span>
                  {roleChip("driver")}
                  <span className={`rounded px-1.5 text-xs ${d.kind === "warp" ? "bg-bg text-sub" : "bg-mintSoft text-mint"}`}>{d.kind === "warp" ? "워프" : "모두의카풀 글"}</span>
                  <span className="num font-semibold">{who(d)}</span>
                  {d.live && liveChip}
                  <span className="ml-auto"><MapBtn d={d} rs={rs} /></span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Places p={d} />
                  <p className="text-xs text-sub sm:text-right">출근 {d.timeGo || "-"} · 퇴근 {d.timeBack || "-"}</p>
                </div>
                <div className="mt-1"><PersonActions k={`${d.kind}:${d.ref}`} warpId={d.kind === "warp" ? d.warpId : ""} userId={d.userId} label={who(d)} canMail={d.kind === "warp" && !!d.warpId} /></div>
                <ul className="mt-3 space-y-3 border-l-2 border-mint pl-3">
                  {rs.map((r) => (
                    <li key={`${r.kind}:${r.ref}`} className="grid gap-2 sm:grid-cols-[1fr_220px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {roleChip("rider")}
                          <span className={`rounded px-1.5 text-xs ${r.kind === "warp" ? "bg-bg text-sub" : "bg-mintSoft text-mint"}`}>{r.kind === "warp" ? "워프" : "모두의카풀 글"}</span>
                          <span className="num font-semibold">{who(r)}</span>
                          {r.live && liveChip}
                        </div>
                        <div className="mt-1"><Places p={r} size="sm" /></div>
                        <p className="mt-0.5 text-xs text-sub">출근 {r.timeGo || "-"} · 퇴근 {r.timeBack || "-"}</p>
                        <Dist m={r} />
                        <PersonActions k={`${r.kind}:${r.ref}`} warpId={r.kind === "warp" ? r.warpId : ""} userId={r.userId} label={who(r)} canMail={r.kind === "warp" && !!r.warpId} />
                      </div>
                      <Score m={r} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>}
        {view === "pairs" && pairs === null && <p className="py-6 text-center text-sub">계산 중…</p>}
        {view === "pairs" && pairs && (
          <ol data-block-id="S419" data-block-name="전체 쌍" className="mt-3 divide-y divide-line">
            {shownPairs.slice(0, gShow).map((x, i) => {
              const d = x.driver;
              const r = x.rider;
              return (
                <li key={`${d.kind}:${d.ref}-${r.kind}:${r.ref}`} className="py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="num w-6 pt-0.5 text-sm text-sub">{i + 1}</span>
                    <div className="w-full max-w-[240px] flex-1"><Score m={r} big /></div>
                    <div className="min-w-0 flex-1 text-right"><MapBtn d={d} rs={[r]} /><div className="mt-1"><Dist m={r} /></div></div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[d, r].map((p) => (
                      <div key={p.role} className="min-w-0 rounded-lg border border-line p-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">{roleChip(p.role)}<span className="num font-semibold">{who(p)}</span>{p.live && liveChip}</div>
                        <div className="mt-1"><Places p={p} size="sm" /></div>
                        <p className="mt-0.5 text-xs text-sub">출근 {p.timeGo || "-"} · 퇴근 {p.timeBack || "-"}</p>
                        <PersonActions k={`${p.kind}:${p.ref}`} warpId={p.kind === "warp" ? p.warpId : ""} userId={p.userId} label={who(p)} canMail={p.kind === "warp" && !!p.warpId} />
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {view === "pairs" && pairs && shownPairs.length > gShow && (
          <button data-block-id="B452" data-block-name="전체 쌍 더 보기" className="mt-3 min-h-0 w-full rounded-xl border border-line bg-white py-2.5 text-sm font-semibold" onClick={() => setGShow((n) => n + 20)}>더 보기 ({shownPairs.length - gShow}개 남음)</button>
        )}
        {view === "pairs" && pairs && pairs.length === 0 && <p className="py-6 text-center text-sub">조건에 맞는 쌍이 없어요. 반경·지역을 넓혀 보세요.</p>}
        {view === "groups" && groups && shownGroups.length > gShow && (
          <button data-block-id="B446" data-block-name="매칭 묶음 더 보기" className="mt-3 min-h-0 w-full rounded-xl border border-line bg-white py-2.5 text-sm font-semibold" onClick={() => setGShow((n) => n + 20)}>더 보기 ({shownGroups.length - gShow}개 남음)</button>
        )}
      </div>

      <details data-block-id="S420" data-block-name="같은 회사 묶음" className="rounded-2xl border border-line bg-white p-4"
        onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && wps === null) loadWps(wpMin); }}>
        <summary className="cursor-pointer text-base font-bold">같은 회사 묶음 <span className="text-sm font-normal text-sub">· 회사 주소가 같은 워프 회원끼리(누르면 펼침)</span></summary>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">최소
            <select data-block-id="F433" data-block-name="같은 회사 최소 인원" className="rounded-lg border border-line bg-white px-2 py-1" value={wpMin}
              onChange={(e) => { const n = Number(e.target.value); setWpMin(n); loadWps(n); }}>
              {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}명</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1"><input data-block-id="F434" data-block-name="운전자 없는 회사만" type="checkbox" checked={wpNoDriver} onChange={(e) => setWpNoDriver(e.target.checked)} />운전자 없는 곳만(운전자 모집 대상)</label>
          {wps && <span className="text-sub">{wpInfo.total}곳 · 운전자 없음 {wpInfo.noDriver}곳</span>}
        </div>
        <p className="mt-1 text-xs text-sub">출근지가 같아서 퇴근길도 함께하기 쉬워요. 운전자가 없는 곳은 탑승자끼리 모여 있으니 운전자 모집 안내 대상이에요. 주소 글자가 같은 것만 묶어요(띄어쓰기·'지하' 무시).</p>
        {wps === null && <p className="py-6 text-center text-sub">계산 중…</p>}
        {wps && (
          <ol className="mt-3 space-y-3">
            {wps.filter((w) => !wpNoDriver || !w.drivers).slice(0, wpShow).map((w) => (
              <li key={w.place} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0"><b className="block text-[15px]" title={w.place}>{w.members[0]?.workShort || w.place}</b>{w.members[0]?.workArea && <span className="block text-[12px] leading-tight text-sub">{w.members[0].workArea}</span>}</span>
                  <span className="num text-sm text-sub">{w.n}명 · 운전자 {w.drivers} · 탑승자 {w.riders}</span>
                  {!w.drivers && <span className="rounded bg-warnSoft px-1.5 text-xs font-semibold text-warn">운전자 없음 → 운전자 모집 대상</span>}
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {w.members.map((m) => {
                    const label = `${m.warpId || "고유번호 없음"}${m.name ? ` · ${m.name}` : ""}`;
                    return (
                      <li key={m.ref} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                        {roleChip(m.role)}
                        <span className="num font-semibold">{label}</span>
                        {m.live && liveChip}
                        <span className="min-w-0 flex-1 text-xs text-sub" title={m.home}>출발 <b className="text-ink">{m.homeShort}</b>{m.homeArea ? ` (${m.homeArea})` : ""} · 출근 {m.timeGo || "-"} · 퇴근 {m.timeBack || "-"}</span>
                        <PersonActions k={`warp:${m.ref}`} warpId={m.warpId} userId={m.userId} label={label} canMail={!!m.warpId} />
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {wps && wps.filter((w) => !wpNoDriver || !w.drivers).length > wpShow && (
          <button data-block-id="B454" data-block-name="같은 회사 더 보기" className="mt-3 min-h-0 w-full rounded-xl border border-line bg-white py-2.5 text-sm font-semibold" onClick={() => setWpShow((n) => n + 20)}>더 보기</button>
        )}
        {wps && wps.length === 0 && <p className="py-6 text-center text-sub">회사 주소가 같은 회원이 {wpMin}명 이상인 곳이 없어요.</p>}
      </details>

      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input data-block-id="F424" data-block-name="정기카풀 검색" className={`${input} min-w-0 flex-1`} placeholder="고유번호·코드·주소·이름" value={q} onChange={(e) => setQ(e.target.value)} />
          <select data-block-id="F425" data-block-name="역할 필터" className="rounded-xl border border-line bg-white px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">전체</option><option value="driver">운전자</option><option value="rider">탑승자</option>
          </select>
          <select data-block-id="F428" data-block-name="올림 필터" className="rounded-xl border border-line bg-white px-3 text-sm" value={pubF} onChange={(e) => setPubF(e.target.value)}>
            <option value="">올림 여부 전체</option><option value="0">아직 안 올림</option><option value="1">올린 글</option>
          </select>
        </div>
        {(rf.from || rf.to) && (
          <p className="mt-2 text-sm">지역: <b>{[rf.from, rf.fromGu].filter(Boolean).join(" ") || "전체"}</b> 출발 → <b>{[rf.to, rf.toGu].filter(Boolean).join(" ") || "전체"}</b> 도착 <span className="text-sub">(위 매칭의 지역 조건이 목록에도 적용돼요)</span>
            <button data-block-id="B457" data-block-name="지역 조건 지우기" className="ml-2 min-h-0 text-accent underline" onClick={() => setRf({ from: "", fromGu: "", to: "", toGu: "" })}>지우기</button></p>
        )}
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} />모두의카풀 계정 있는 회원만</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={geoOk} onChange={(e) => { setGeoOk(e.target.checked); if (e.target.checked) setNoGeo(false); }} />출발·도착 위치 모두 찾은 글만</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={noGeo} onChange={(e) => { setNoGeo(e.target.checked); if (e.target.checked) setGeoOk(false); }} />위치 못 찾은 글만</label>
          <label className="flex items-center gap-1"><input data-block-id="F435" data-block-name="바로 연락 가능 회원만" type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} />바로 연락 가능한 회원만</label>
          <label className="flex items-center gap-1"><input data-block-id="F436" data-block-name="주소 확인 필요만" type="checkbox" checked={badOnly} onChange={(e) => setBadOnly(e.target.checked)} />주소 확인 필요만{stats?.bad ? ` (${stats.bad})` : ""}</label>
        </div>
        <div data-block-id="S418" data-block-name="정기카풀로 올리기" className="sticky top-0 z-10 mt-3 rounded-xl border border-accent bg-accentSoft p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">선택 {sel.size}건</span>
            <button data-block-id="B447" data-block-name="올릴 수 있는 것 모두 선택" className="min-h-0 rounded-lg border border-line bg-white px-2.5 py-1" onClick={() => setSel(new Set(rows.filter(canPublish).map((r) => r.code)))}>올릴 수 있는 것 모두 선택 ({rows.filter(canPublish).length})</button>
            <button data-block-id="B448" data-block-name="선택 해제" className="min-h-0 rounded-lg border border-line bg-white px-2.5 py-1" onClick={() => setSel(new Set())}>선택 해제</button>
            <span className="ml-auto flex items-center gap-2">
              비용
              <select data-block-id="F429" data-block-name="올릴 때 비용" className="rounded-lg border border-line bg-white px-2 py-1" value={cost} onChange={(e) => setCost(e.target.value === "fixed" ? "fixed" : "free")}>
                <option value="free">무료</option><option value="fixed">희망 금액</option>
              </select>
              {cost === "fixed" && <input data-block-id="F430" data-block-name="희망 금액" inputMode="numeric" className="w-24 rounded-lg border border-line bg-white px-2 py-1" placeholder="원(1회)" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} />}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button data-block-id="B449" data-block-name="선택한 글 정기카풀로 올리기" disabled={pubBusy || !sel.size} className="min-h-0 flex-1 rounded-xl bg-accent py-2.5 font-bold text-white disabled:opacity-50" onClick={() => doPublish("publish", [...sel])}>{pubBusy ? "처리 중…" : `선택한 ${sel.size}건 정기카풀로 올리기`}</button>
            <button data-block-id="B450" data-block-name="선택한 글 내리기" disabled={pubBusy || !sel.size} className="min-h-0 rounded-xl border border-line bg-white px-4 py-2.5 font-semibold disabled:opacity-50" onClick={() => doPublish("unpublish", [...sel])}>선택 내리기</button>
          </div>
          <p className="mt-1 text-xs text-sub">계정이 있는 회원 · 출발·도착 위치를 모두 찾은 글만 올라가요(자택·회사 주소가 같은 글은 빼요). 장소 이름은 "송파대로 345"처럼 짧게 쓰고, 아래 지역 글씨는 위치로 자동으로 붙어요.</p>
          {pubMsg && <p className="mt-1 text-sm font-semibold">{pubMsg}</p>}
        </div>
        <ul className="mt-3 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.code} className={`py-3 ${base?.code === r.code ? "bg-accentSoft/60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input type="checkbox" aria-label="선택" className="h-4 w-4" checked={sel.has(r.code)} onChange={() => toggle(r.code)} />
                {roleChip(r.role)}
                <span className="num font-semibold">{r.warpId || "고유번호 없음"}</span>
                {r.name && <span className="text-mint">· 모두의카풀 {r.name}</span>}
                {r.live && liveChip}
                {r.bad && <span className="rounded bg-warnSoft px-1.5 text-xs font-semibold text-warn" title="자택과 회사 주소가 같아요. 매칭·글 올리기에서 빠져요.">주소 확인 필요</span>}
                {r.withdrawn && <span className="text-warn">· 워프 탈퇴</span>}
                {!r.active && <span className="text-sub">· 미사용</span>}
                {r.dup > 0 && <span className="rounded bg-warnSoft px-1.5 text-xs font-semibold text-warn">중복 {r.dup}회</span>}
                {r.moved ? <span className="rounded bg-mintSoft px-1.5 text-xs font-semibold text-mint">정기카풀로 올림</span> : !r.userId ? <span className="rounded bg-bg px-1.5 text-xs text-sub">계정 없음</span> : null}
                <span className="ml-auto text-xs text-sub">{r.regDate} · {r.code}</span>
              </div>
              <div className="mt-1.5"><Places p={r} /></div>
              <p className="text-xs text-sub">출근 {r.timeGo || "-"} · 퇴근 {r.timeBack || "-"}{!r.geo && (r.tried ? " · 위치 못 찾음" : " · 위치 찾는 중")}</p>
              <div className="mt-1 flex flex-wrap items-center gap-4">
                <button data-block-id="B442" data-block-name="매칭 후보 찾기" disabled={!r.geo} className="min-h-0 text-sm font-bold text-accent underline disabled:text-sub disabled:no-underline" onClick={() => pickBase(r)}>매칭 후보 찾기</button>
                <PersonActions k={`w:${r.code}`} warpId={r.warpId} userId={r.userId} label={`${r.warpId}${r.name ? ` · ${r.name}` : ""}`} canMail={r.hasMail && !r.withdrawn} />
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="py-6 text-center text-sub">저장된 정기카풀이 없어요. [목록 붙여넣기]로 올려 주세요.</p>}
      </div>

      {base && (
        <div id="pool-cands" data-block-id="S414" data-block-name="매칭 후보" className="rounded-2xl border-2 border-accent bg-white p-4">
          <p className="text-sm text-sub">기준</p>
          <p className="font-semibold">{roleChip(base.role)} {base.warpId}</p>
          <div className="mt-1"><Places p={base} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">반경
              <input data-block-id="F426" data-block-name="매칭 반경" type="number" min={0.5} max={30} step={0.5} className="w-20 rounded-lg border border-line px-2 py-1" value={radius} onChange={(e) => setRadius(Number(e.target.value) || 3)} />km
            </label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={opp} onChange={(e) => setOpp(e.target.checked)} />반대 역할만 (운전자↔탑승자)</label>
            <button data-block-id="B443" data-block-name="후보 다시 찾기" className="min-h-0 rounded-lg bg-accent px-3 py-1.5 font-semibold text-white" onClick={() => findCands(base, radius, opp)}>다시 찾기</button>
          </div>
          {candMsg && <p className="mt-2 text-sm text-warn">{candMsg}</p>}
          {cands && cands.length === 0 && <p className="mt-3 text-sm text-sub">반경 {radius}km 안에 후보가 없어요. 반경을 넓혀 보세요.</p>}
          {cands && cands.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {cands.map((c) => (
                <li key={`${c.kind}:${c.ref}`} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {roleChip(c.role)}
                    <span className={`rounded px-1.5 text-xs ${c.kind === "warp" ? "bg-bg text-sub" : "bg-mintSoft text-mint"}`}>{c.kind === "warp" ? "워프" : "모두의카풀 글"}</span>
                    <span className="num font-semibold">{c.warpId || (c.kind === "warp" ? "고유번호 없음" : "")}</span>
                    {c.name && <span>{c.name}</span>}
                    <span className="num ml-auto font-bold text-accent">자택 {c.homeKm}km · {c.workKm != null && c.workKm >= 0 ? `회사 ${c.workKm}km` : "회사 비교 안 함"}</span>
                  </div>
                  <div className="mt-1"><Places p={c} size="sm" /></div>
                  <p className="text-xs text-sub">출근 {c.timeGo || "-"} · 퇴근 {c.timeBack || "-"}</p>
                  <div className="mt-1">
                    <PersonActions k={`${c.kind}:${c.ref}`} warpId={c.kind === "warp" ? c.warpId : ""} userId={c.userId} label={`${c.warpId}${c.name ? ` · ${c.name}` : ""}`} canMail={c.kind === "warp"} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notify && <NotifyModal target={notify} onClose={() => setNotify(null)} />}
      {mapFor && <PairMap driver={mapFor.driver} riders={mapFor.riders} onClose={() => setMapFor(null)} />}
    </section>
  );
}
