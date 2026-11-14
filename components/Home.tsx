"use client";
import { needPush } from "@/lib/pushGate";
const MatchButton = dynamic(() => import("./MatchSheet").then((m) => m.MatchButton), { ssr: false });
import dynamic from "next/dynamic";
import FareCard from "./Fare";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CarInput from "./CarInput";
import { Sparkle } from "./MapSparkle";
import { areaLabel } from "@/lib/areaLabel";
import { SITE_URL } from "@/lib/site";
import { matchesFor, type PostMatch } from "@/lib/postMatch";
import { HIDDEN_TEXT, METER_URL, SHOW_METER, defaultRoleFor, type Post, type Thread, type User } from "@/lib/types";
import { FloatingCall, IncomingCall, IncomingTaxiCall } from "./CallSheet";
import { Bubble, useHintTap, RoleTag, Avatar, TierBadge, Card, Icon, Sheet, Tag, api, btnGhost, btnPrimary, btnRole, distanceKm, field, kmText, money, scheduleText, useLang, useT, when } from "./ui";

const PostMap = dynamic(() => import("./PostMap"), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-3xl bg-white" aria-hidden /> });

type Role = "all" | "driver" | "rider";

/** 글 키워드 칩. 카드에서는 앞의 몇 개만 */
export function KeywordChips({ post, max }: { post: Post; max?: number }) {
  const t = useT();
  const list = post.tags ?? [];
  if (!list.length) return null;
  const shown = max ? list.slice(0, max) : list;
  return (
    <div data-block-id="C015" data-block-name="키워드" className="flex flex-wrap gap-1.5">
      {shown.map((k) => (
        <span key={k.label} className={`rounded-full px-2.5 py-1 text-[13px] ${k.group === "gift" ? "bg-[#FFF7E6] text-[#9A5B00]" : "bg-bg text-sub"}`}>
          {k.group === "gift" ? `${t("감사")} · ` : "#"}{t(k.label)}
        </span>
      ))}
      {max && list.length > max && <span className="px-1 text-[13px] text-sub">+{list.length - max}</span>}
    </div>
  );
}

function PostTags({ post }: { post: Post }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="flex flex-wrap gap-1.5">
      {post.regular && <Tag>{t("정기카풀")}</Tag>}
      <Tag tone={post.role === "driver" ? "accent" : "mint"}>{post.role === "driver" ? t("운전자입니다") : t("탑승자입니다")}</Tag>
      {!post.regular && <Tag>{post.kind === "commute" ? t("출퇴근") : t("나들이·관광")}</Tag>}
      {post.taxiShare && <Tag tone="accent">{t("택시 동승 찾는 중")}</Tag>}
      <Tag tone={post.cost === "free" || (post.cost === "meter" && !SHOW_METER) ? "plain" : "warn"}>{post.cost === "fixed" ? `${t("희망")} ${money(post.price ?? 0, lang)}` : post.cost === "meter" && SHOW_METER ? t("비용 나눔") : t("무료")}</Tag>
    </div>
  );
}

export function Route({ origin, dest, originArea, destArea }: { origin: string; dest: string; originArea?: string; destArea?: string }) {
  const oa = areaLabel(origin, originArea);
  const da = areaLabel(dest, destArea);
  // 점은 각 장소 이름 줄에 맞추고, 두 점 사이를 세로선으로 잇는다(지역 글씨가 붙어도 점이 이름 옆에 온다).
  return (
    <div className="relative min-w-0 space-y-1.5 text-[17px] font-semibold leading-snug">
      <p className="relative min-w-0 pl-[22px]">
        <span aria-hidden className="absolute -bottom-[calc(0.375rem+0.45em)] left-[4.5px] top-[calc(0.45em+10px)] w-px bg-line" />
        <span aria-hidden className="absolute left-0 top-[0.45em] h-2.5 w-2.5 rounded-full border-2 border-accent bg-white" />
        <span className="block truncate">{origin}</span>
        {oa && <span className="block truncate text-[12px] font-normal leading-tight text-sub">{oa}</span>}
      </p>
      <p className="relative min-w-0 pl-[22px]">
        <span aria-hidden className="absolute left-0 top-[0.45em] h-2.5 w-2.5 rounded-full bg-accent" />
        <span className="block truncate">{dest}</span>
        {da && <span className="block truncate text-[12px] font-normal leading-tight text-sub">{da}</span>}
      </p>
    </div>
  );
}

/**
 * 현재 역할 알약 버튼(헤더 한 줄). 누르면 운전자 ↔ 탑승자가 바뀐다.
 * 차량이 없는 상태에서 운전자로 바꾸려 하면 내 정보(차량 등록)로 보낸다.
 * 바꾼 역할은 프로필 희망 역할로 저장되며, 카풀 등록의 기본 역할이 된다.
 */
export function RoleSwitch({ user, onUser, toast }: { user: User | null; onUser?: (u: User) => void; toast: (m: string) => void; onGoProfile?: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [carOpen, setCarOpen] = useState(false);
  const hintTap = useHintTap();
  if (!user) return null;
  const current = defaultRoleFor(user);
  const registered = !!(user.carNo && user.carPhoto);
  const toggle = async () => {
    if (busy) return;
    if (hintTap("C930")) return;
    // 탑승자 모드에서 차량이 없으면 내 차량 등록창을 띄운다. 저장하면 닫힌다.
    if (current === "rider" && !registered) return setCarOpen(true);
    const next = current === "driver" ? "rider" : "driver";
    setBusy(true);
    const res = await api<{ user: User }>("/api/auth", "PATCH", { rolePref: next });
    setBusy(false);
    if (!res.ok) return toast(t(res.error));
    onUser?.(res.data.user);
  };
  const isDriver = current === "driver";
  return (
    <>
    <button
      type="button"
      data-block-id="B302"
      data-block-name="현재 역할 바꾸기"
      aria-label={`${t("현재 역할")}: ${isDriver ? t("운전자 모드") : t("탑승자 모드")}`}
      onClick={toggle}
      disabled={busy}
      className={`min-h-[44px] shrink-0 rounded-full px-4 py-2 text-[15px] motion-safe:transition-colors ${isDriver ? "bg-accent font-bold text-white" : "bg-mint font-bold text-white"}`}
    >
      {isDriver ? t("운전자 모드") : t("탑승자 모드")}
    </button>
    {carOpen &&
      createPortal(
        <Sheet title={t("내 차량 등록")} blockId="S331" onClose={() => setCarOpen(false)}>
          <CarInput
            user={user}
            toast={toast}
            onSaved={(u) => {
              onUser?.(u);
              window.dispatchEvent(new CustomEvent("moducarpool:user", { detail: u }));
              setCarOpen(false);
            }}
          />
        </Sheet>,
        document.body,
      )}
    </>
  );
}

/**
 * 글의 지역 이름(지역 필터용, 2026-11-05 사용자 요청). 지역 글씨 첫 낱말을 쓴다:
 * 광역시·세종은 그대로("서울"·"인천"), 도 지역은 도 이름("경기"·"경남"·"제주")으로 묶는다.
 */
const METRO_RE = /^(서울|부산|대구|인천|광주|대전|울산|세종)(특별시|광역시|특별자치시)?$/;
// 지역 필터는 도 단위로 묶는다(2026-11-05 사용자 요청: 시 단위는 너무 많음). 지역 글씨는 광역시면 "서울 …", 도 지역이면 "수원시 …"처럼 시·군부터 온다.
// 광주광역시는 "광주", 경기 광주시는 "광주시"로 들어온다. 고성군(강원·경남 둘 다 있음)은 강원으로(사용자 지시).
const PROVINCE_TOWNS: Record<string, string> = {
  경기: "수원시 성남시 고양시 용인시 부천시 안산시 안양시 남양주시 화성시 평택시 의정부시 시흥시 파주시 광명시 김포시 군포시 광주시 이천시 양주시 오산시 구리시 안성시 포천시 의왕시 하남시 여주시 양평군 동두천시 과천시 가평군 연천군",
  강원: "춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군 화천군 양구군 인제군 양양군 고성군",
  충북: "청주시 충주시 제천시 보은군 옥천군 영동군 증평군 진천군 괴산군 음성군 단양군",
  충남: "천안시 공주시 보령시 아산시 서산시 논산시 계룡시 당진시 금산군 부여군 서천군 청양군 홍성군 예산군 태안군",
  전북: "전주시 군산시 익산시 정읍시 남원시 김제시 완주군 진안군 무주군 장수군 임실군 순창군 고창군 부안군",
  전남: "목포시 여수시 순천시 나주시 광양시 담양군 곡성군 구례군 고흥군 보성군 화순군 장흥군 강진군 해남군 영암군 무안군 함평군 영광군 장성군 완도군 진도군 신안군",
  경북: "포항시 경주시 김천시 안동시 구미시 영주시 영천시 상주시 문경시 경산시 의성군 청송군 영양군 영덕군 청도군 고령군 성주군 칠곡군 예천군 봉화군 울진군 울릉군",
  경남: "창원시 진주시 통영시 사천시 김해시 밀양시 거제시 양산시 의령군 함안군 창녕군 남해군 하동군 산청군 함양군 거창군 합천군",
  제주: "제주시 서귀포시",
  대구: "군위군",
};
const TOWN_TO_PROVINCE = new Map(Object.entries(PROVINCE_TOWNS).flatMap(([pv, towns]) => towns.split(" ").map((tw) => [tw, pv] as const)));
const PROVINCE_PREFIX: [RegExp, string][] = [[/^경기/, "경기"], [/^강원/, "강원"], [/^(충청북|충북)/, "충북"], [/^(충청남|충남)/, "충남"], [/^(전라북|전북)/, "전북"], [/^(전라남|전남)/, "전남"], [/^(경상북|경북)/, "경북"], [/^(경상남|경남)/, "경남"], [/^제주/, "제주"]];
function regionOf(area?: string | null): string {
  const first = (area ?? "").trim().split(" ")[0] ?? "";
  if (!first) return "";
  const m = METRO_RE.exec(first);
  if (m) return m[1];
  const town = TOWN_TO_PROVINCE.get(first);
  if (town) return town;
  for (const [re, pv] of PROVINCE_PREFIX) if (re.test(first)) return pv;
  return first;
}
const postRegions = (p: Post) => [...new Set([regionOf(p.originArea), regionOf(p.destArea)].filter(Boolean))];
const REGION_KEY = "modu.regions";
/** 지역 필터 켜기(2026-11-06 사용자 지시: 회원이 적은 동안은 끄고, 누르면 '준비 중입니다' 팝업). 회원이 늘면 true로 */
const REGION_FILTER_ON = false;

export default function Home({ posts, sample, onOpen, toast, onGoProfile, onPost, onSubway, onSubwaySetup, driverMode }: { posts: Post[]; sample: boolean; onOpen: (p: Post) => void; toast: (m: string) => void; driverMode?: boolean; onRefresh?: () => void; onGoProfile?: () => void; onPost?: () => void; onSubway?: (view: "seat" | "match" | "edit") => void; onSubwaySetup?: () => void }) {
  const t = useT();
  const lang = useLang();
  const hintTap = useHintTap();
  const [role, setRole] = useState<Role>("all");
  // 지역 필터: 고른 지역(여러 곳) 중 출발·도착 한 곳이라도 맞는 글만. 이 기기에 기억한다.
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionSoon, setRegionSoon] = useState(false);
  useEffect(() => {
    if (!REGION_FILTER_ON) return; // 꺼져 있는 동안은 예전에 골라 둔 지역도 적용하지 않는다
    try {
      const saved = JSON.parse(localStorage.getItem(REGION_KEY) ?? "[]");
      if (Array.isArray(saved) && saved.length) setRegions(new Set(saved.map(String)));
    } catch {
      /* 무시 */
    }
  }, []);
  const saveRegions = (next: Set<string>) => {
    setRegions(next);
    try {
      localStorage.setItem(REGION_KEY, JSON.stringify([...next]));
    } catch {
      /* 무시 */
    }
  };
  const toggleRegion = (r: string) => {
    const n = new Set(regions);
    if (n.has(r)) n.delete(r);
    else n.add(r);
    saveRegions(n);
  };
  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of posts) for (const r of postRegions(p)) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  }, [posts]);
  // 키워드 필터: 고른 키워드 중 하나라도 붙은 글만 (여러 개 고르면 OR)
  const [q, setQ] = useState("");
  const [regularOnly, setRegularOnly] = useState(false);
  // [정기카풀]을 눌렀을 때 결과 수를 알림으로 보여 준다(목록이 거의 안 바뀌어 검색이 안 된 줄 아는 일을 막음, 2026-11-12 사용자 지시)
  const regularTapped = useRef(false);
  // 내 글만 모아 보기. 켜면 각 내 글 아래에 매칭률 높은 상대 글을 보여 준다(2026-11-02).
  const [mineOnly, setMineOnly] = useState(false);
  // 정렬: 최신순(기본) · 가까운 순(내 위치 필요) · 출발 임박순
  const [sort, setSort] = useState<"soon" | "new" | "near">("new");
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  // [경로 분석] 버튼의 깜빡이는 점: 한 번 열어 보면 끈다(localStorage modu.mapSeen)
  const [mapSeen, setMapSeen] = useState(true);
  useEffect(() => { try { setMapSeen(localStorage.getItem("modu.mapSeen") === "1"); } catch { /* 저장소 없음 */ } }, []);
  const markMapSeen = () => { setMapSeen(true); try { localStorage.setItem("modu.mapSeen", "1"); } catch { /* 저장소 없음 */ } };
  // 호출 알림을 누르고 들어오면(?call=ID) 받은 호출 창을 연다.
  const [incomingId, setIncomingId] = useState<string | null>(null);
  // 택시동승 호출 알림(?taxicall=ID)도 같은 방식으로 연다.
  const [incomingTaxiId, setIncomingTaxiId] = useState<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("call");
    if (id) setIncomingId(id);
    const tid = sp.get("taxicall");
    if (tid) setIncomingTaxiId(tid);
  }, []);
  // 목록은 12개씩 나눠 보여 준다. 필터가 바뀌면 처음 12개로 돌아간다.
  const PAGE = 12;
  const [shown, setShown] = useState(PAGE);

  const pickSort = (s: "soon" | "new" | "near") => {
    // 거리순·출발순은 켜고 끄는 버튼: 다시 누르면 기본(최신순)으로 돌아간다.
    if (s !== "new" && sort === s) return setSort("new");
    if (s === "near" && !here && hintTap("C932")) return;
    if (s !== "near") {
      setSort(s);
      return;
    }
    if (here) return setSort("near");
    toggleNear();
  };
  const toggleNear = () => {
    if (!("geolocation" in navigator)) return toast(t("이 기기는 위치 확인을 지원하지 않아요."));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSort("near");
      },
      (err) => {
        setLocating(false);
        toast(t(err.code === err.PERMISSION_DENIED ? "위치 권한을 허용해 주세요." : "현재 위치를 찾지 못했어요."));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };
  const resetFilters = () => {
    setRole("all");
    setQ("");
    setRegularOnly(false);
    setMineOnly(false);
    setSort("new");
    saveRegions(new Set());
  };
  /** 내 위치에서 글의 출발지까지 거리(km). 위치가 없는 글은 null. */
  const far = (p: Post) => (here && p.originLat != null && p.originLng != null ? distanceKm(here.lat, here.lng, p.originLat, p.originLng) : null);

  // 전체 글 수·검색·더 보기(2026-11-14 사용자 지시 "건수는 총 등록 건수, 검색은 전체 대상"):
  // 앱이 처음 받는 글은 최근 300건이라, 공개 글 전체 수는 따로 받고(첫 화면 뒤 1.5초), 검색어가 있으면 서버에서 전체 글을 찾고,
  // [더 보기]가 받아 둔 글 끝에 닿으면 다음 300건을 더 받는다.
  const qKey = q.trim();
  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState<Post[]>([]);
  const [hits, setHits] = useState<{ q: string; posts: Post[]; total: number } | null>(null);
  const loadingMore = useRef(false);
  useEffect(() => {
    setMore([]);
    if (sample) return;
    const id = setTimeout(() => {
      void api<{ total: number }>("/api/posts?count=1").then((r) => r.ok && setTotal(r.data.total));
    }, 1500);
    return () => clearTimeout(id);
  }, [posts, sample]);
  useEffect(() => {
    if (sample || !qKey) return setHits(null);
    const id = setTimeout(async () => {
      const enc = encodeURIComponent(qKey);
      const [a, c] = await Promise.all([api<{ posts: Post[] }>(`/api/posts?q=${enc}`), api<{ total: number }>(`/api/posts?count=1&q=${enc}`)]);
      if (a.ok) setHits({ q: qKey, posts: a.data.posts, total: c.ok ? c.data.total : a.data.posts.length });
    }, 350);
    return () => clearTimeout(id);
  }, [qKey, sample]);
  const pool = useMemo(() => {
    const extra = qKey ? (hits?.q === qKey ? hits.posts : []) : more;
    if (!extra.length) return posts;
    const seen = new Set(posts.map((p) => p.id));
    return [...posts, ...extra.filter((p) => !seen.has(p.id) && seen.add(p.id))];
  }, [posts, more, hits, qKey]);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = pool.filter(
      (p) =>
        (role === "all" || p.role === role) &&
        (!regularOnly || !!p.regular) &&
        (!mineOnly || p.mine) &&
        (regions.size === 0 || postRegions(p).some((r) => regions.has(r))) &&
        // "정기카풀"이라고 검색해도 정기카풀 글이 나오게 한다.
        // 서버 검색과 같게: 띄어쓰기로 나눈 낱말이 모두 들어 있으면(지역 글씨 포함)
        (!words.length || ((hay) => words.every((w) => hay.includes(w)))(`${p.owner} ${p.ownerCode ?? ""} ${p.origin} ${p.dest} ${p.originArea ?? ""} ${p.destArea ?? ""} ${p.note} ${(p.tags ?? []).map((x) => x.label).join(" ")} ${p.regular ? `정기카풀 ${t("정기카풀")}` : ""}`.toLowerCase())),
    );
    // 최신순: 마감·종료된 글도 등록 순서대로 섞어 보여 준다(회원이 적은 동안 실사용자 글이 위에 보이도록).
    // 실사용자 글을 임시글·테스트 계정 글보다 먼저, 그 안에서는 최근 등록 순.
    if (sort === "new") {
      const real = (p: Post) => (p.demo || p.ownerTest ? 1 : 0);
      // 제주 글과 정기 매칭에서 한꺼번에 올린 글은 다른 글 뒤에(2026-11-05 사용자 요청). 지역 필터에서 제주를 고르면 제주 글은 평소 순서로.
      const jejuLow = !regions.has("제주");
      const low = (p: Post) => (p.warpPool || (jejuLow && postRegions(p).includes("제주")) ? 1 : 0);
      return [...hit].sort((a, b) => real(a) - real(b) || low(a) - low(b) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }
    // 다른 정렬에서는 종료·마감된 글을 맨 아래에 둔다.
    const over = (p: Post) => !!p.ended || p.status === "closed";
    const live = hit.filter((p) => !over(p));
    const done = hit.filter(over);
    // 가까운 순: 출발 위치가 저장된 글을 거리순으로, 위치가 없는 글은 뒤에 둔다.
    if (sort === "near" && here) live.sort((a, b) => (far(a) ?? Infinity) - (far(b) ?? Infinity));
    return [...live, ...done];
    // 검색어·필터가 바뀔 때만 다시 계산한다(t는 언어가 바뀌면 달라진다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, role, q, regularOnly, mineOnly, lang, here, sort, regions]);
  useEffect(() => {
    if (!regularTapped.current) return;
    regularTapped.current = false;
    toast(regularOnly ? t(`정기카풀 ${list.length}건을 보여 드려요`) : t(`정기카풀 필터를 껐어요 · 전체 ${list.length}건`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  // 내 글마다 매칭률 높은 상대 글 3개(내 글 모아 보기일 때만 계산). 상대는 전체 글에서 찾는다.
  const matchMap = useMemo(() => {
    if (!mineOnly) return null;
    const m: Record<string, PostMatch[]> = {};
    for (const p of posts) if (p.mine) m[p.id] = matchesFor(p, posts);
    return m;
  }, [posts, mineOnly]);

  useEffect(() => {
    setShown(PAGE);
  }, [q, role, regularOnly, mineOnly, sort, here, regions]);
  // 필터 없이 보거나 검색만 할 때는 서버 기준 전체 건수, 그 밖의 필터는 받아 둔 글 기준
  const plain = role === "all" && !regularOnly && !mineOnly && regions.size === 0;
  const fullCount = !plain ? list.length : qKey ? (hits?.q === qKey ? Math.max(hits.total, list.length) : list.length) : Math.max(total ?? 0, list.length);
  const showMore = async () => {
    const next = shown + PAGE;
    setShown(next);
    // 받아 둔 글이 곧 끝나면 다음 300건을 미리 받는다
    if (!plain || next + PAGE <= list.length || list.length >= fullCount || loadingMore.current) return;
    loadingMore.current = true;
    try {
      if (qKey && hits?.q === qKey) {
        const r = await api<{ posts: Post[] }>(`/api/posts?q=${encodeURIComponent(qKey)}&offset=${hits.posts.length}`);
        if (r.ok) setHits((h) => (h && h.q === qKey ? { ...h, posts: [...h.posts, ...r.data.posts] } : h));
      } else if (!qKey) {
        const r = await api<{ posts: Post[] }>(`/api/posts?offset=${posts.length + more.length}`);
        if (r.ok) setMore((m) => [...m, ...r.data.posts]);
      }
    } finally {
      loadingMore.current = false;
    }
  };

  return (
    <section data-block-id="S001" data-block-name="카풀 찾기" className="space-y-3">

      <div className="space-y-2">
        {/* 검색창과 목록·지도 전환을 한 줄에 둔다(지도 전환은 작은 버튼). 키워드 필터는 검색창 박스 안에 둔다 */}
        <div data-block-id="C070" data-block-name="검색 박스" className="space-y-2 rounded-2xl border border-line bg-white p-2.5">
          <div className="flex items-center gap-2">
            <input data-block-id="F001" className={`${field} min-w-0 flex-1 py-2.5`} type="search" placeholder={t("장소, 고유코드, 키워드 등 검색")} aria-label={t("장소, 고유코드, 키워드 등 검색")} value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" data-block-id="B004" data-block-name="목록 지도 전환" aria-pressed={view === "map"} onClick={() => { if (view === "list" && hintTap("C931")) return; markMapSeen(); setView((v) => (v === "map" ? "list" : "map")); }}
              className={`relative min-h-0 shrink-0 rounded-xl border px-3 py-2.5 text-[14px] ${view === "map" ? "border-accent bg-accentSoft font-semibold text-accent" : "border-brand bg-brand font-semibold text-white"}`}>
              {view === "map" ? t("목록") : <span className="flex items-center gap-1"><Sparkle className="h-4 w-4" />{t("경로 분석")}</span>}
              {view === "list" && !mapSeen && <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-coral" aria-hidden />}
            </button>
          </div>
          {view === "list" && <div className="flex justify-end"><Bubble blockId="C931" align="right">{t("지도에서 같은 길 회원 수, 모이는 곳, 카풀로 줄이는 월 납입금까지 분석해 드려요.")}</Bubble></div>}
        </div>
        {/* [지역] + [운전자만]·[탑승자만](켜고 끄기, 둘 다 꺼짐 = 전체). 2026-11-05 사용자 요청으로 [전체] 버튼을 지역 필터로 바꿈 */}
        <div className="flex items-center gap-1.5">
          <button type="button" data-block-id="B009" data-block-name="지역 필터" aria-expanded={regionOpen} onClick={() => (REGION_FILTER_ON ? setRegionOpen((v) => !v) : setRegionSoon(true))}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-3.5 py-2 text-[14px] ${regions.size ? "border-ink bg-white font-semibold text-ink" : "border-line bg-white text-sub"}`}>
            {regions.size ? `${t("지역")} ${regions.size}${t("곳")}` : t("지역")}
            <span aria-hidden className="text-[11px]">{regionOpen ? "▲" : "▼"}</span>
          </button>
          <button type="button" data-block-id="B010" data-block-name="운전자만 보기" role="switch" aria-checked={role === "driver"} onClick={() => setRole((r) => (r === "driver" ? "all" : "driver"))}
            className={`min-h-[44px] flex-1 whitespace-nowrap rounded-xl border px-3 py-2 text-[14px] ${role === "driver" ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
            {t("운전자만")}
          </button>
          <button type="button" data-block-id="B011" data-block-name="탑승자만 보기" role="switch" aria-checked={role === "rider"} onClick={() => setRole((r) => (r === "rider" ? "all" : "rider"))}
            className={`min-h-[44px] flex-1 whitespace-nowrap rounded-xl border px-3 py-2 text-[14px] ${role === "rider" ? "border-mint bg-mintSoft font-semibold text-mint" : "border-line bg-white text-sub"}`}>
            {t("탑승자만")}
          </button>
        </div>
        {regionSoon && (
          <div role="dialog" aria-modal="true" aria-label={t("지역 필터")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6" onClick={() => setRegionSoon(false)}>
            <div data-block-id="C434" data-block-name="지역 필터 준비 중" className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
              <p className="text-[16px] font-semibold text-ink">{t("준비 중입니다")}</p>
              <p className="mt-1.5 text-[14px] text-sub">{t("회원이 더 모이면 지역별로 골라 볼 수 있게 열어 드릴게요.")}</p>
              <button type="button" data-block-id="B489" onClick={() => setRegionSoon(false)} className="mt-4 min-h-[44px] w-full rounded-xl bg-accent text-[15px] font-semibold text-white">{t("확인")}</button>
            </div>
          </div>
        )}
        {regionOpen && (
          <div data-block-id="C012" data-block-name="지역 고르기" className="rounded-2xl border border-line bg-white p-3">
            <p className="text-[13px] text-sub">{t("보고 싶은 지역을 고르세요. 출발지나 도착지가 그 지역인 글만 보여요.")}</p>
            {regionCounts.length === 0 ? (
              <p className="py-3 text-center text-[14px] text-sub">{t("지역 정보가 있는 글이 아직 없어요.")}</p>
            ) : (
              <div className="mt-2 grid max-h-60 grid-cols-2 gap-1.5 overflow-y-auto min-[400px]:grid-cols-3">
                {regionCounts.map(([r, n]) => (
                  <button key={r} type="button" role="checkbox" aria-checked={regions.has(r)} onClick={() => toggleRegion(r)}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[14px] ${regions.has(r) ? "border-ink font-semibold text-ink" : "border-line text-sub"}`}>
                    <CheckBox on={regions.has(r)} />
                    <span className="min-w-0 truncate">{r}</span>
                    <span className="num ml-auto shrink-0 text-[12px] text-sub">{n}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" data-block-id="B012" data-block-name="지역 초기화" disabled={!regions.size} onClick={() => saveRegions(new Set())} className="min-h-[40px] flex-1 rounded-xl border border-line bg-white text-[14px] text-sub disabled:opacity-50">{t("초기화")}</button>
              <button type="button" onClick={() => setRegionOpen(false)} className="min-h-[40px] flex-1 rounded-xl bg-ink text-[14px] font-semibold text-white">{t("닫기")}</button>
            </div>
          </div>
        )}
        {/* 정렬과 정기카풀 필터를 한 줄에 둔다 */}
        {/* 한 줄을 넘기지 않는다. 좁은 화면에서는 줄바꿈 대신 옆으로 밀어 본다(정기카풀이 아래로 내려가지 않게). */}
        <div className={`flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${view === "map" ? "hidden" : "flex"}`}>
          <div data-block-id="B003" data-block-name="정렬" role="group" aria-label={t("정렬")} className="flex shrink-0 flex-nowrap gap-1.5">
            {/* 기본은 최신순. 거리순·출발순은 켜고 끄기(다시 누르면 최신순) */}
            {([["near", locating ? t("위치를 찾는 중…") : t("거리순")], ["soon", t("출발순")]] as const).map(([k, label]) => (
              <button key={k} type="button" role="switch" aria-checked={sort === k} disabled={k === "near" && locating} onClick={() => pickSort(k)} className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[14px] max-[380px]:px-2.5 max-[380px]:text-[13px] ${sort === k ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
                {label}
              </button>
            ))}
          </div>
          {/* 필터(체크 상자 모양)는 정렬(알약 모양)과 얇은 선으로 나눈다 */}
          <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
          <div className="flex shrink-0 flex-nowrap gap-1.5">
            <button type="button" data-block-id="B008" data-block-name="내 글 모아보기" role="switch" aria-checked={mineOnly} onClick={() => setMineOnly((v) => !v)} className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[14px] max-[380px]:px-2 max-[380px]:text-[13px] ${mineOnly ? "border-ink bg-white font-semibold text-ink" : "border-line bg-white text-sub"}`}>
              <CheckBox on={mineOnly} />
              {t("내 글")}
            </button>
            <button type="button" data-block-id="B002" data-block-name="정기카풀 필터" role="switch" aria-checked={regularOnly} onClick={() => { regularTapped.current = true; setRegularOnly((v) => !v); }} className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[14px] max-[380px]:px-2 max-[380px]:text-[13px] ${regularOnly ? "border-ink bg-white font-semibold text-ink" : "border-line bg-white text-sub"}`}>
              <CheckBox on={regularOnly} />
              {t("정기카풀")}
            </button>
          </div>
        </div>
        {view === "list" && <Bubble blockId="C932" align="left">{t("거리순은 내 위치를 허용하면 쓸 수 있어요. 출발지가 가까운 글부터 보여요.")}</Bubble>}
        {sort === "near" && here && <p className="text-[13px] text-sub">{t("내 위치에서 출발지가 가까운 글부터 보여 줍니다. 출발 위치가 없는 글은 아래에 나옵니다.")}</p>}
      </div>

      {sample && <p className="rounded-2xl bg-accentSoft px-4 py-3 text-[14px] text-ink">{t("지금 보이는 글은 화면 확인용 예시입니다.")}</p>}

      {view === "map" ? (
        <PostMap posts={list} onOpen={onOpen} here={here} />
      ) : list.length === 0 ? (
        <Card className="space-y-3 px-6 py-10 text-center">
          <p className="text-[16px] font-semibold text-ink">{t("조건에 맞는 카풀이 아직 없어요.")}</p>
          <p className="text-[14px] text-sub">{t("검색어나 필터를 바꾸거나, 직접 카풀을 올려 보세요.")}</p>
          <div className="flex flex-col gap-2 pt-2">
            <button type="button" data-block-id="B006" data-block-name="필터 초기화" className={btnGhost} onClick={resetFilters}>{t("필터 초기화")}</button>
            {onPost && <button type="button" data-block-id="B007" data-block-name="카풀 올리기" className={btnPrimary} onClick={onPost}>{t("카풀 올리기")}</button>}
          </div>
        </Card>
      ) : (
        <>
        <ul className="space-y-3">
          {list.slice(0, shown).map((p) => (
            <li key={p.id}>
              <button data-block-id="C001" data-block-name="카풀 카드" onClick={() => onOpen(p)} className={`block w-full text-left ${p.ended || p.status === "closed" ? "opacity-60" : ""}`}>
                <Card className="space-y-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <PostTags post={p} />
                    <span className="flex shrink-0 gap-1.5">{p.ended && <Tag>{t("종료")}</Tag>}{!p.ended && p.status === "closed" && <Tag>{t("마감")}</Tag>}{!p.ended && p.status === "progress" && <Tag tone="accent">{t("카풀 진행 중")}</Tag>}{p.call && <Tag tone="mint">{p.call.count > 1 ? `CALL ${p.call.count}` : "CALL"}</Tag>}{p.mine && <Tag>{t("내 글")}</Tag>}</span>
                  </div>
                  <Route origin={p.origin} dest={p.dest} originArea={p.originArea} destArea={p.destArea} />
                  <KeywordChips post={p} max={2} />
                  <div className="flex items-center justify-between text-[14px] text-sub">
                    <span className="num">{scheduleText(p, lang)}{far(p) != null && <b className="ml-1.5 font-semibold text-accent">· {kmText(far(p) as number)}</b>}</span>
                    <span className="flex items-center gap-1.5"><Avatar src={p.ownerPhoto} name={p.owner} role={p.role} size={28} />{p.owner}<TierBadge tier={p.ownerTier} />{p.fromWarp && <span className="rounded-md bg-violetSoft px-1.5 py-0.5 text-[11px] font-semibold text-violet">{t("워프 동기화")}</span>}</span>
                  </div>
                </Card>
              </button>
              {matchMap && <MyMatches matches={matchMap[p.id] ?? []} onOpen={onOpen} />}
            </li>
          ))}
        </ul>
        {fullCount > shown && (
          <button type="button" data-block-id="B005" data-block-name="목록 더 보기" onClick={() => void showMore()} className={`${btnGhost} py-3 text-[15px]`}>
            {t("더 보기")} <span className="num text-sub">({(fullCount - Math.min(shown, list.length)).toLocaleString("ko-KR")})</span>
            <span className="mt-0.5 block text-[12px] font-normal text-sub">{t("전체")} {fullCount.toLocaleString("ko-KR")}{t("건")}</span>
          </button>
        )}
        </>
      )}
      {/* 떠 있는 CALL 버튼·받은 호출 창은 맨 뒤에 둔다(space-y 여백이 첫 칸 위에 생기지 않게) */}
      {/* CALL은 탑승자가 주변 운전자를 부르는 버튼이라 운전자 모드에서는 숨긴다(받은 호출 창은 그대로). */}
      {!driverMode && <FloatingCall toast={toast} onGoProfile={onGoProfile} onSubway={onSubway} onSubwaySetup={onSubwaySetup} />}
      {incomingId && <IncomingCall callId={incomingId} toast={toast} onClose={() => { setIncomingId(null); window.history.replaceState(null, "", "/"); }} />}
      {incomingTaxiId && <IncomingTaxiCall callId={incomingTaxiId} toast={toast} onClose={() => { setIncomingTaxiId(null); window.history.replaceState(null, "", "/"); }} />}
    </section>
  );
}

/** 필터 칩의 체크 상자(얇은 선 SVG). 켜지면 안에 체크 표시가 든다. */
function CheckBox({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.2" />
      {on && <path d="M4.5 8.2l2.3 2.3 4.7-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** 내 글 아래 매칭률 높은 상대 글(반대 역할, 반경 안·가는 길 위). 누르면 그 글을 연다. */
function MyMatches({ matches, onOpen }: { matches: PostMatch[]; onOpen: (p: Post) => void }) {
  const t = useT();
  if (matches.length === 0) return <p className="px-1 pt-2 text-[13px] text-sub">{t("지금 반경 3km 안에 맞는 상대 글이 없어요.")}</p>;
  return (
    <div className="mt-2 space-y-1.5 rounded-2xl bg-bg p-3">
      <p className="text-[13px] font-semibold text-sub">{t("매칭률 높은 상대")}</p>
      {matches.map((m) => (
        <button key={m.post.id} type="button" data-block-id="C945" data-block-name="내 글 매칭 상대" onClick={() => onOpen(m.post)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-left">
          <span className="min-w-0">
            <span className="block truncate text-[14px] text-ink">{m.post.origin} → {m.post.dest}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-sub">
              <span>{m.post.role === "driver" ? t("운전자") : t("탑승자")}</span>
              <span>· {kmText(m.originKm)}</span>
              {m.routePct != null && <span>· {t("경로 일치")} {m.routePct}%</span>}
              {m.timeOk === true && <span className="text-accent">· {t("시간 맞음")}</span>}
              {m.onRoute && <span>· {t("가는 길 위")}</span>}
            </span>
          </span>
          <span className="num shrink-0 text-[17px] font-bold text-accent">{m.pct}%</span>
        </button>
      ))}
    </div>
  );
}

export function PostDetail({
  post,
  user,
  sample,
  threads,
  onClose,
  onChanged,
  goLogin,
  openChat,
  toast,
  onEditCommute,
  onEdit,
  onRepost,
  onProfile,
  onBlock,
}: {
  post: Post;
  user: User | null;
  sample: boolean;
  threads: Thread[];
  onClose: () => void;
  onChanged: () => void;
  goLogin: () => void;
  openChat: (th: Thread) => void;
  toast: (m: string) => void;
  onEditCommute: (p: Post) => void;
  onEdit: (p: Post) => void;
  /** 같은 요일·시간으로 다시 올리기(1회 카풀) */
  onRepost?: (p: Post) => void;
  /** 회원 프로필 열기, 사유를 받아 차단하기 */
  onProfile: (id: string) => void;
  onBlock: (id: string, name: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(post.remind !== false);
  const mineThread = threads.find((th) => th.postId === post.id && !th.iAmOwner);
  const incoming = threads.filter((th) => th.postId === post.id && th.iAmOwner);

  const run = async (url: string, method: string, data?: unknown, done?: string) => {
    setBusy(true);
    const r = await api(url, method, data);
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    if (done) toast(t(done));
    onChanged();
  };

  const share = async () => {
    // 공유 주소는 늘 대표 도메인의 글 페이지(2026-11-14 사용자 지시: vercel.app 주소·옛 미리보기가 나가던 문제).
    // 글 페이지는 제목이 "강남구 → 분당구 출퇴근 정기카풀"처럼 나오고 [앱에서 신청하기]로 앱의 그 글을 연다.
    const url = `${SITE_URL}/post/${post.id}`;
    const text = `${post.origin} → ${post.dest} · ${scheduleText(post, lang)}`;
    try {
      if (navigator.share) await navigator.share({ title: t("모두의카풀"), text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast(t("링크를 복사했어요."));
      }
    } catch {
      /* 공유 취소 */
    }
  };

  const statusText = { pending: t("수락 대기 중"), accepted: t("수락됨"), declined: t("거절됨") };

  return (
    <Sheet title={t("카풀 상세")} blockId="S010" onClose={onClose}>
      <div className="space-y-4">
        <PostTags post={post} />
        <Route origin={post.origin} dest={post.dest} originArea={post.originArea} destArea={post.destArea} />
        <KeywordChips post={post} />
        {post.call && (
          <div data-block-id="C460" data-block-name="CALL 기록" className="space-y-1 rounded-2xl bg-mintSoft px-4 py-3 text-[14px] text-mint">
            <p className="font-semibold">CALL {post.call.count}{t("번 보냈어요")} · {when(post.call.at, lang)}</p>
            {post.call.mine && <p>{t("알림")} {post.call.notified.toLocaleString("ko-KR")}{t("명 · 수락")} {post.call.accepts.toLocaleString("ko-KR")}{t("명")}</p>}
          </div>
        )}
        <dl className="space-y-2 text-[16px]">
          {post.regular && <div className="flex justify-between"><dt className="text-sub">{t("일정")}</dt><dd className="num font-semibold">{scheduleText(post, lang)}</dd></div>}
          <div className="flex justify-between"><dt className="text-sub">{t("출발")}</dt><dd className="num font-semibold">{when(post.departAt, lang)}</dd></div>
          {post.cost === "fixed" && <div className="flex justify-between"><dt className="text-sub">{t("희망금액(1회)")}</dt><dd className="num font-semibold text-warn">{money(post.price ?? 0, lang)}</dd></div>}
          <div className="flex justify-between"><dt className="text-sub">{post.role === "driver" ? t("운전자입니다") : t("탑승자입니다")}</dt><dd>{user && !sample && post.ownerId ? <button data-block-id="B017" data-block-name="작성자 프로필" className="flex min-h-0 items-center gap-2 font-semibold underline decoration-line underline-offset-4" onClick={() => onProfile(post.ownerId as string)}><Avatar src={post.ownerPhoto} name={post.owner} role={post.role} size={32} />{post.owner}<TierBadge tier={post.ownerTier} /></button> : <span className="flex items-center gap-2 font-semibold"><Avatar src={post.ownerPhoto} name={post.owner} role={post.role} size={32} />{post.owner}<TierBadge tier={post.ownerTier} /></span>}</dd></div>
        </dl>
        {post.originLat != null && post.originLng != null && (
          <a data-block-id="B014" data-block-name="출발 위치 지도" href={`https://map.kakao.com/link/map/${encodeURIComponent(post.origin)},${post.originLat},${post.originLng}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl bg-bg px-4 text-[15px] font-semibold text-ink">
            {t("출발 위치 지도에서 보기")} {Icon.arrow()}
          </a>
        )}
        <FareCard post={post} />
        {post.carPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-block-id="C012" data-block-name="차량 사진" src={post.carPhoto} alt={t("운전자 차량 사진")} loading="lazy" className="max-h-56 w-full rounded-2xl border border-line object-cover" />
        )}
        {post.ownerBio && <p className="rounded-2xl bg-bg px-4 py-3 text-[15px] text-sub">{post.ownerBio}</p>}
        {post.note && <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{post.note}</p>}

        {post.cost === "fixed" ? (
          <p className="rounded-2xl border border-[#F6D9C4] bg-warnSoft p-4 text-[14px] leading-relaxed text-[#7C2D12]">{t("운전자가 정한 카풀 비용입니다. 출퇴근 실비를 나누는 용도이며 결제는 당사자끼리 직접 합니다.")}</p>
        ) : post.cost === "meter" && SHOW_METER ? (
          <div className="space-y-2 rounded-2xl border border-[#F6D9C4] bg-warnSoft p-4 text-[14px] leading-relaxed text-[#7C2D12]">
            <p>{t("비용 나눔은 출퇴근 카풀에 한해 실비를 나누는 용도입니다. 영리 목적의 운송은 법으로 금지되어 있습니다.")}</p>
            <a data-block-id="B010" data-block-name="미터기 열기" href={METER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl bg-white px-4 font-semibold text-ink">
              {t("모카 미터기로 비용 나누기")} {Icon.arrow()}
            </a>
          </div>
        ) : (
          <p className="rounded-2xl bg-bg px-4 py-3 text-[14px] text-sub">{t("무료 운행입니다. 금전을 요구하거나 주고받지 않습니다.")}</p>
        )}

        {post.mine ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-sub">{t("받은 신청")} {incoming.length}</h3>
            {incoming.length === 0 && <p className="text-[15px] text-sub">{t("아직 신청이 없어요.")}</p>}
            {incoming.map((th) => (
              <div key={th.id} className="space-y-2 rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <button className="flex min-h-0 items-center gap-2 font-semibold underline decoration-line underline-offset-4" onClick={() => th.otherId && onProfile(th.otherId)}><Avatar src={th.otherPhoto} name={th.other} role={th.otherRole} size={28} />{th.other}</button>
                  <span className="flex items-center gap-2">
                    {th.otherId && <button className="min-h-0 text-[13px] text-sub underline" disabled={busy} onClick={() => onBlock(th.otherId as string, th.other)}>{t("차단")}</button>}
                    <Tag tone={th.status === "accepted" ? "accent" : "plain"}>{statusText[th.status]}</Tag>
                  </span>
                </div>
                {th.otherBio && <p className="text-[14px] text-sub">{th.otherBio}</p>}
                {th.message && <p className="whitespace-pre-wrap text-[15px]">{th.message}</p>}
                {th.status === "pending" && (
                  <div className="flex gap-2">
                    <button disabled={busy} className={`${btnGhost} py-3 text-[15px]`} onClick={() => run("/api/requests", "PATCH", { id: th.id, status: "declined" })}>{t("거절")}</button>
                    <button data-block-id="B011" data-block-name="신청 수락" disabled={busy} className={`${btnRole(post.role)} py-3 text-[15px]`} onClick={() => run("/api/requests", "PATCH", { id: th.id, status: "accepted" }, "수락했어요. 이제 대화할 수 있습니다.")}>{t("수락")}</button>
                  </div>
                )}
                {th.status === "accepted" && <button className={`${btnGhost} py-3 text-[15px]`} onClick={() => openChat(th)}>{t("대화하기")}</button>}
              </div>
            ))}
            <MatchButton post={post} toast={toast} />
            {post.hidden && <p data-block-id="C014" data-block-name="노출 안 됨 안내" className="rounded-xl bg-warnSoft px-4 py-3 text-[14px] text-warn">{t(HIDDEN_TEXT[post.hidden])}</p>}
            {!post.regular && onRepost && (
              <button data-block-id="B401" data-block-name="다시 올리기" className={`${post.ended || post.status === "closed" ? btnRole(post.role) : btnGhost} py-3 text-[15px]`} onClick={() => onRepost(post)}>{t("같은 요일·시간으로 다시 올리기")}</button>
            )}
            <button data-block-id="B015" data-block-name="글 수정" className={`${post.regular || !(post.ended || post.status === "closed") ? btnRole(post.role) : btnGhost} py-3 text-[15px]`} onClick={() => (post.regular ? onEditCommute(post) : onEdit(post))}>{post.regular ? t("출퇴근 정보 수정") : t("글 수정")}</button>
            {!post.regular && onRepost && (
              <label data-block-id="F401" data-block-name="다시 올리기 알림" className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[14px]">
                <span>{t("매주 하루 전 다시 올리기 알림")}<span className="block text-[12px] text-sub">{t("전날 저녁 8시에 푸시로 알려 드려요")}</span></span>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-accent" checked={remind} onChange={(e) => { const v = e.target.checked; setRemind(v); void api("/api/posts", "PATCH", { id: post.id, remind: v }).then((r) => { if (!r.ok) { setRemind(!v); toast(t(r.error)); } else toast(t(v ? "하루 전 알림을 켰어요." : "하루 전 알림을 껐어요.")); }); }} />
              </label>
            )}
            <div className="flex gap-2 pt-1">
              {post.role === "rider" ? (
                <button
                  data-block-id="B018"
                  data-block-name="진행 중 / 다시 게시"
                  disabled={busy}
                  className={`${btnGhost} py-3 text-[15px]`}
                  onClick={() => {
                    if (post.status !== "open") return run("/api/posts", "PATCH", { id: post.id, status: "open" }, "다시 게시했어요. 운전자를 다시 모집합니다.");
                    if (!window.confirm(t("다른 운전자의 카풀 신청이 중지됩니다.\n카풀이 불발된 경우 '다시 게시' 버튼을 눌러 운전자를 다시 모집할 수 있습니다."))) return;
                    run("/api/posts", "PATCH", { id: post.id, status: "progress" }, "카풀 진행 중으로 표시했어요.");
                  }}
                >
                  {post.status === "open" ? t("일시정지") : t("다시 게시")}
                </button>
              ) : (
                <button disabled={busy} className={`${btnGhost} py-3 text-[15px]`} onClick={() => run("/api/posts", "PATCH", { id: post.id, status: post.status === "open" ? "closed" : "open" }, post.status === "open" ? "마감했어요." : "다시 열었어요.")}>
                  {post.status === "open" ? t("모집 마감") : t("다시 열기")}
                </button>
              )}
              <button
                disabled={busy}
                className={`${btnGhost} py-3 text-[15px] text-warn`}
                onClick={async () => {
                  if (!window.confirm(t("이 글을 삭제할까요?"))) return;
                  await run(`/api/posts?id=${post.id}`, "DELETE", undefined, "삭제했어요.");
                  onClose();
                }}
              >
                {t("삭제")}
              </button>
            </div>
          </div>
        ) : mineThread ? (
          <div className="space-y-2 rounded-2xl bg-accentSoft p-4">
            <p className="font-semibold">{t("내 신청")}: {statusText[mineThread.status]}</p>
            {mineThread.status === "accepted" ? (
              <button className={`${btnRole(post.role === "driver" ? "rider" : "driver")} py-3 text-[15px]`} onClick={() => openChat(mineThread)}>{t("대화하기")}</button>
            ) : (
              mineThread.status === "pending" && (
                <button
                  data-block-id="B014"
                  data-block-name="신청 취소"
                  disabled={busy}
                  className={`${btnGhost} py-3 text-[15px]`}
                  onClick={() => {
                    if (!window.confirm(t("신청을 취소할까요? 수락 전이라 언제든 다시 신청할 수 있어요."))) return;
                    run(`/api/requests?id=${mineThread.id}`, "DELETE", undefined, "신청을 취소했어요.");
                  }}
                >
                  {t("신청 취소")}
                </button>
              )
            )}
          </div>
        ) : (
          post.ended ? (
            <p data-block-id="C016" data-block-name="종료 안내" className="rounded-2xl bg-bg px-4 py-4 text-center text-[15px] font-semibold text-sub">{t("출발 시각이 지나 종료된 카풀이에요.")}</p>
          ) : post.status === "closed" ? (
            <p data-block-id="C017" data-block-name="마감 안내" className="rounded-2xl bg-bg px-4 py-4 text-center text-[15px] font-semibold text-sub">{t("마감된 카풀이에요. 지금은 신청을 받지 않습니다.")}</p>
          ) : post.status === "progress" ? (
            <p data-block-id="C011" data-block-name="카풀 진행 중 안내" className="rounded-2xl bg-accentSoft px-4 py-4 text-center text-[15px] font-semibold text-accent">{t("카풀 진행 중인 글이에요. 지금은 신청을 받지 않습니다.")}</p>
          ) : (
          <div className="space-y-2">
            {user && !sample && (
              <label className="block text-sm text-sub">
                {t("한마디 (선택)")}
                <textarea data-block-id="F010" className={`${field} mt-1`} rows={2} maxLength={300} placeholder={t("간단한 소개나 타는 곳을 적어 주세요.")} value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
            )}
            <button
              data-block-id="B012"
              data-block-name="카풀 신청"
              disabled={busy}
              className={btnRole(post.role === "driver" ? "rider" : "driver")}
              onClick={() => {
                if (sample) return toast(t("예시 글에는 신청할 수 없어요."));
                if (!user) return goLogin();
                if (needPush()) return; // 알림이 꺼져 있으면 먼저 켜게 한다
                run("/api/requests", "POST", { postId: post.id, message }, "신청했어요. 수락되면 대화할 수 있습니다.");
              }}
            >
              {user || sample ? t(post.role === "driver" ? "운전자에게 신청하기" : "탑승자에게 신청하기") : t("로그인하고 신청하기")}
            </button>
            <p className="text-center text-[13px] text-sub">{t("연락처는 상대가 수락한 뒤에만 서로 공개됩니다.")}</p>
          </div>
          )
        )}

        <button data-block-id="B013" data-block-name="공유" className="w-full text-[15px] text-sub underline" onClick={share}>{t("이 카풀 공유하기")}</button>
        {user && !sample && !post.mine && post.ownerId && (
          <button data-block-id="B016" data-block-name="회원 차단" disabled={busy} className="w-full text-[14px] text-sub underline" onClick={() => onBlock(post.ownerId as string, post.owner)}>{t("이 회원 차단")}</button>
        )}
      </div>
    </Sheet>
  );
}
