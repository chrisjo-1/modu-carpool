"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { Post, User } from "@/lib/types";
import type { LineId, SubwayPlan } from "@/lib/subway";
import { ALL_LINES, DEFAULT_PILOT_LINES, LINE_STATIONS, lineColor, lineTheme } from "@/lib/subway";
import { Segment, Sheet, api, field, useT } from "../ui";
import { headingFor, headingsAt, routePath } from "@/lib/subwayRoute";
import SubwayCarGuide from "./SubwayCarGuide";
import SubwayMatches from "./SubwayMatches";
import SeatSpotCard from "./SeatSpotCard";
import { type Posture, type TodayRide } from "./SubwayCall";
import { slotOf } from "@/lib/seatCar";
import RidePing from "./RidePing";
import StationSign from "./StationSign";

// 안내 사진은 시트를 열 때만 불러온다.
const LocationHelp = dynamic(() => import("./LocationHelp"), { ssr: false });

/**
 * 하단 '지하철' 메뉴. 오늘 탑승(시각에 맞춘 방면 자동, 선택 가능) 아래에 두 기능: ① 앉을 칸 찾기(추천 칸·앉았어요)
 * ② 매칭(받은 요청 수락 → 자리·메모 보여 주기). 앉았어요는 같은 방향 가능자 전체에 푸시하고 하루 1회 적립한다.
 * 지하철 출퇴근 등록은 '설정(내 출퇴근 정보)'의 지하철 칸에서 한다.
 * 이 폴더와 App.tsx의 탭 연결 한 곳을 지우면 기능 전체를 뺄 수 있다.
 */
type Kind = "go" | "back";
/**
 * 오늘 탑승 정보(이 기기, 날짜가 바뀌면 무시). kind는 접속 시각으로 정한 방면(내 방면·반대 방면).
 * 노선·승차역·하차역은 지하철 화면에서 오늘만 바꿀 수 있다(설정의 등록은 기본값일 뿐). 시각은 항상 지금.
 */
type Today = { date: string; kind: Kind; line?: LineId; board: string; alight?: string; next: string; posture?: Posture };
type EditV = { line: LineId; board: string; alight: string };
const TODAY_KEY = "modu.subwayToday";
const kstNow = () => new Date(Date.now() + 9 * 3600_000);
const kstDate = () => kstNow().toISOString().slice(0, 10);
const kstHM = () => kstNow().toISOString().slice(11, 16);
const toMin = (hm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

/**
 * 접속 시각으로 방면을 고른다(등록 화면에서 시각을 받지 않는다).
 * 반대 방면을 등록하지 않았으면 항상 내 방면, 등록했으면 오후 2시 전 → 내 방면, 이후 → 반대 방면.
 */
function autoKind(plan: SubwayPlan, hm: string): Kind {
  if (!plan.back) return "go";
  return toMin(hm) < 14 * 60 ? "go" : "back";
}

const stationOf = (p: SubwayPlan, k: Kind) => (k === "go" ? p.board : p.alight);
const alightOf = (p: SubwayPlan, k: Kind) => (k === "go" ? p.alight : p.board);
const lineOf = (p: SubwayPlan, k: Kind): LineId => (k === "go" ? p.boardLine : p.alightLine);

function readToday(): Today | null {
  try {
    const v = JSON.parse(localStorage.getItem(TODAY_KEY) ?? "null") as Today | null;
    return v && v.date === kstDate() ? v : null;
  } catch {
    return null;
  }
}

function storeToday(v: Today | null) {
  try {
    if (v) localStorage.setItem(TODAY_KEY, JSON.stringify(v));
    else localStorage.removeItem(TODAY_KEY);
  } catch {
    /* 무시 */
  }
}

/**
 * 접속할 때 만드는 오늘 값. 종류와 출발 시각은 접속 기준으로 다시 정하고,
 * 같은 종류로 이미 고친 탑승역·방향·직접 고친 시각·자세는 이어서 쓴다.
 */
function freshToday(plan: SubwayPlan, kind: Kind, prev: Today | null): Today {
  const p = prev && prev.kind === kind && prev.line && prev.alight ? prev : null;
  return {
    date: kstDate(),
    kind,
    line: p?.line || lineOf(plan, kind),
    board: p?.board || stationOf(plan, kind),
    alight: p?.alight || alightOf(plan, kind),
    next: p?.next || (kind === "go" ? plan.boardNext : plan.backNext),
    posture: p?.posture ?? "",
  };
}

export default function SubwayTab({ user, onSettings, start }: { user: User | null; toast: (m: string) => void; onSettings?: () => void; start?: { view: "seat" | "match" | "edit"; n: number } | null }) {
  const t = useT();
  const [plan, setPlan] = useState<SubwayPlan | null>(null);
  const [days, setDays] = useState("");
  const [seatOn, setSeatOn] = useState(false);
  const [pilot, setPilot] = useState<LineId[]>(DEFAULT_PILOT_LINES);
  // 앉았어요 뒤에 고른 칸(자리 위치 입력에서 다시 묻지 않는다)
  const [spotCar, setSpotCar] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [askPlan, setAskPlan] = useState(false);
  const [planDays, setPlanDays] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // 내 자리 알리기의 "대화로 알리기" → 매칭 목록에서 매칭된 상대 대화를 연다.
  const [chatAsk, setChatAsk] = useState(0);
  const [today, setTodayState] = useState<Today | null>(null);
  const [editing, setEditing] = useState(false);
  // 메뉴 안의 화면: 빈 값 = 두 기능 메뉴, seat = 앉을 칸 찾기, match = 매칭
  // 위쪽 탭(2026-11-12 재구성): 앉아가기 | 매칭 | 내 자리. 메뉴 화면 없이 바로 앉아가기.
  const [view, setView] = useState<"seat" | "match" | "spot">(start && start.view !== "edit" ? start.view : "seat");
  /** [앉았어요] 직후 '내 자리' 맨 위 안내(적립 결과 + 자리 남기면 받을 추가 크레딧) */
  const [sitNote, setSitNote] = useState<{ done: string; bonus: number; alight?: string } | null>(null);
  // CALL에서 들어오면 그 화면을 바로 연다. edit은 "오늘 노선·역 바꾸기"를 펼친 메뉴.
  useEffect(() => {
    if (!start) return;
    if (start.view === "edit") {
      setView("seat");
      setEditing(true);
    } else setView(start.view);
  }, [start]);
  const initRef = useRef(false);
  const setToday = (v: Today) => {
    setTodayState(v);
    storeToday(v);
  };

  // 요일은 출퇴근 정보(정기카풀)의 요일을 먼저 쓰고, 없으면 등록 때 저장한 요일을 쓴다.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [cfg, mine, posts] = await Promise.all([
        api<{ enabled: boolean; pilot?: LineId[] }>("/api/seat/config"),
        api<{ plan: SubwayPlan | null; days: string }>("/api/seat/plan"),
        api<{ posts: Post[] }>("/api/posts?mine=1"),
      ]);
      if (!alive) return;
      setSeatOn(cfg.ok && !!cfg.data.enabled);
      if (cfg.ok && Array.isArray(cfg.data.pilot) && cfg.data.pilot.length) setPilot(cfg.data.pilot);
      setPlan(mine.ok ? mine.data.plan : null);
      setPlanDays(mine.ok ? mine.data.days : "");
      const regular = posts.ok ? posts.data.posts.find((p) => p.regular && p.days) : undefined;
      setDays(regular?.days || (mine.ok ? mine.data.days : "") || "12345");
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // 탭을 열 때 한 번: 접속 시각으로 방면을 고른다.
  useEffect(() => {
    if (!plan || initRef.current) return;
    initRef.current = true;
    const v = freshToday(plan, autoKind(plan, kstHM()), readToday());
    setTodayState(v);
    storeToday(v);
  }, [plan]);

  // 등록이 없으면 설정으로 이동할지 한 번 물어본다.
  useEffect(() => {
    if (loaded && !plan) setAskPlan(true);
  }, [loaded, plan]);

  if (!user) {
    return (
      <section className="space-y-3 pt-2">
        <h1 className="text-[28px] font-bold">{t("지하철 앉아가기")}</h1>
        <p className="text-[15px] leading-relaxed text-sub">{t("로그인하고 설정에서 지하철을 등록하면 앉아갈 수 있는 정보와 매칭을 보여 드려요.")}</p>
      </section>
    );
  }

  const kind: Kind = today?.kind ?? "go";
  const lineNow: LineId = today?.line || (plan ? lineOf(plan, kind) : "2");
  const board = today?.board || (plan ? stationOf(plan, kind) : "");
  const alight = today?.alight || (plan ? alightOf(plan, kind) : "");
  const timeNow = kstHM();
  const dirs = plan && board ? headingsAt(lineNow, board) : [];
  // 진행 방향은 승차역 → 하차역으로 정한다(따로 고르지 않는다).
  const heading = (alight ? dirs.find((h) => h.next === headingFor(lineNow, board, alight)?.next) : undefined) ?? dirs[0] ?? null;
  const lineName = ALL_LINES.find((l) => l.id === lineNow)?.name ?? "";
  const posture: Posture = today?.posture ?? "";
  // 요일은 화면에 보이지 않는다. 혼잡도 자료(평일·토·일) 구분에만 쓴다.
  const dayNow = new Date(Date.now() + 9 * 3600_000).getUTCDay();
  // 오늘 고른 노선·역(서버가 등록 정보 대신 쓴다)
  const stopsTo = board && alight ? ((p) => (p ? p.length - 1 : null))(routePath(lineNow, board, alight)) : null;
  const ride: TodayRide | undefined = board && alight ? { line: lineNow, board, alight, next: heading?.next ?? "" } : undefined;

  /** 칸 안내의 [앉았어요]: 같은 노선·방향 분께 알리고(하루 첫 번째 적립), 앉은 상태로 바꾼다. 돌려준 문구는 결과 칸에 보인다. */
  const sitNow = async (car: string): Promise<string> => {
    setSpotCar(car);
    if (!plan) return t("설정에서 지하철 정보를 등록하면 같은 방향 분께도 알릴 수 있어요.");
    const r = await api<{ sent: number; credit: number; spotBonus?: number; alight?: { alight: string; prev: string } | null }>("/api/seat/call", "POST", { trip: kind, today: ride });
    if (!r.ok) return t(r.error);
    if (today) setToday({ ...today, posture: "sit" });
    setReloadKey((k) => k + 1);
    const who = r.data.sent > 0 ? `${r.data.sent}${t("명에게 알렸어요.")}` : t("지금은 자리를 받을 분이 없어요.");
    const done = r.data.credit > 0 ? `${who} +${r.data.credit.toLocaleString("ko-KR")}${t("크레딧 적립")}` : who;
    // 2026-11-13 사용자 지시: [앉았어요] 뒤 바로 '내 자리'로 옮겨 앉은 자리를 남기게 하고, 추가 크레딧을 알린다.
    setSitNote({ done, bonus: r.data.spotBonus ?? 0, alight: r.data.alight?.alight ?? "" });
    setView("spot");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    return done;
  };
  const switchKind = (k: Kind) => {
    if (plan) setToday(freshToday(plan, k, null));
    setEditing(false);
  };

  return (
    <section className="space-y-4 pb-10 pt-2" data-block-id="S070" data-block-name="지하철 탭" style={lineTheme(lineNow) as CSSProperties}>
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[26px] font-black text-brand">{t("지하철 앉아가기")}</h1>
        <button type="button" data-block-id="B260" className="min-h-0 text-[13px] font-medium text-sub" onClick={() => setHelp(true)}>{t("위치 찾는 법")}</button>
      </div>
      {loaded && plan && seatOn && (
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label={t("지하철 메뉴")}>
          {([
            ["seat", t("앉아가기"), "B280"],
            ["match", t("매칭"), "B281"],
            ["spot", t("내 자리"), "B283"],
          ] as const).map(([k, label, id]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} data-block-id={id} onClick={() => setView(k)} className={`rounded-xl py-2.5 text-[14px] font-semibold ${view === k ? "bg-brand text-white" : "border border-line bg-white text-sub"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {!loaded && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {loaded && !plan && <EmptyPlan onSettings={onSettings} />}

      {loaded && plan && today && (
        <>
          {/* 오늘 탑승: 노선 색 역 표지판 + 방면·하차역까지 정거장 + 오늘만 노선·역 바꾸기 */}
          <div data-block-id="C130" data-block-name="오늘 탑승" className="space-y-3 rounded-2xl border border-line bg-white p-3.5 shadow-card">
            {plan.back ? (
              <Segment
                compact
                label={t("방면")}
                value={kind}
                onChange={switchKind}
                accents={{ go: "line", back: "line" }}
                options={[
                  ["go", `${plan.board} → ${plan.alight}`],
                  ["back", `${plan.alight} → ${plan.board}`],
                ]}
              />
            ) : null}
            <StationSign line={lineNow} station={board} next={heading?.next} />
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-[14px] text-ink">
                <span className="mr-1.5 rounded-md px-1.5 py-0.5 align-middle text-[11px] font-bold" style={{ background: lineColor(lineNow).bg, color: lineColor(lineNow).text }}>{t(lineName)}</span>
                <b>{heading?.terminal ? `${heading.terminal} ${t("방면")}` : heading?.next ? `${heading.next} ${t("방향")}` : ""}</b>
                {alight && stopsTo != null && <span className="text-sub"> · {alight}{t("까지")} {stopsTo}{t("정거장")}</span>}
              </p>
              <button type="button" data-block-id="B262" data-block-name="오늘 노선·역 바꾸기" className="min-h-0 shrink-0 py-1 text-[13px] font-semibold text-brand" onClick={() => setEditing((v) => !v)}>
                {editing ? t("닫기") : t("노선·역 바꾸기")}
              </button>
            </div>
            {editing && (
              <TodayEditor
                pilot={pilot}
                init={{ line: lineNow, board, alight }}
                onSave={(v) => {
                  const hs = headingsAt(v.line, v.board);
                  const next = headingFor(v.line, v.board, v.alight)?.next ?? hs[0]?.next ?? "";
                  setToday({ ...today, date: kstDate(), kind, line: v.line, board: v.board, alight: v.alight, next });
                  setEditing(false);
                }}
                onReset={() => {
                  setToday({ ...freshToday(plan, kind, null), posture: today.posture ?? "" });
                  setEditing(false);
                }}
              />
            )}
          </div>

          {!seatOn ? (
            <NotOpen />
          ) : view === "seat" ? (
            /* 앉아가기: ① 열차 고르기 ② 칸-문 ③ 탔나요? (칸 안내 안에서). [앉았어요]는 같은 방향 분께 알림·적립까지 한 번에. */
            <SubwayCarGuide key={`${kind}|${lineNow}|${board}|${heading?.next ?? ""}`} line={lineNow} station={board} alight={alight} prefer={heading?.next ?? ""} timeGo={timeNow} onSeated={sitNow} />
          ) : view === "spot" ? (
            /* 내 자리: 자리 위치·힌트, 이동 중 현재역 다시 알리기 */
            <div className="space-y-4">
              {sitNote && (
                <div data-block-id="C445" data-block-name="앉았어요 → 자리 남기기 안내" className="rounded-2xl border-2 border-lc bg-white px-4 py-3">
                  <p className="text-[15px] font-bold text-ink">✓ {t("앉았어요 저장")}</p>
                  <p className="mt-0.5 text-[13px] text-sub">{sitNote.done}</p>
                  {sitNote.alight && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2" data-block-id="C446" data-block-name="하차 알림">
                      <p className="text-[13.5px] text-ink">🔔 {t("하차 알림 켜짐")} · <b>{sitNote.alight}</b>{t("역 전에 알려 드려요")}</p>
                      <button
                        type="button"
                        data-block-id="B500"
                        className="min-h-0 shrink-0 rounded-full border border-line bg-white px-3 py-1 text-[12.5px] font-semibold text-sub"
                        onClick={async () => {
                          const d = await api("/api/seat/alight", "DELETE");
                          if (d.ok) setSitNote((n) => (n ? { ...n, alight: "" } : n));
                        }}
                      >
                        {t("끄기")}
                      </button>
                    </div>
                  )}
                  {sitNote.bonus > 0 && (
                    <p className="mt-2 rounded-xl bg-lcSoft px-3 py-2 text-[14px] font-semibold text-ink">
                      {t("앉은 자리를 아래 그림에서 골라 남기면")} <b className="text-brand">+{sitNote.bonus.toLocaleString("ko-KR")} {t("크레딧")}</b>{t("을 더 받아요.")}
                    </p>
                  )}
                </div>
              )}
              <p className="text-[13px] text-sub">{posture === "sit" ? t("내 자리 위치와 힌트 (선택) · 매칭된 상대에게만 보여요") : t("앉은 뒤 자리 위치를 남기면 매칭된 상대가 찾아올 수 있어요.")}</p>
              <SeatSpotCard line={lineNow} station={board} next={heading?.next} presetCar={spotCar} hideCar={!!spotCar} autoEdit={!!sitNote} onSaved={(c) => { if (c) setSitNote((n) => (n ? { ...n, bonus: 0, done: `${n.done} · ${t("자리 남기기")} +${c.toLocaleString("ko-KR")}${t("크레딧 적립")}` } : n)); }} onChat={() => setChatAsk((k) => k + 1)} />
              <details className="group" data-block-id="C133" data-block-name="현재역 다시 알리기 (선택)">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {t("이동 중 현재역 다시 알리기 (선택)")}
                  <span className="text-[12px] font-normal text-sub group-open:hidden">{t("펼치기")}</span>
                  <span className="hidden text-[12px] font-normal text-sub group-open:inline">{t("접기")}</span>
                </summary>
                <div className="pt-3">
                  <RidePing line={lineNow} from={board} />
                </div>
              </details>
            </div>
          ) : (
            <SubwayMatches myTime={timeNow} myDays={planDays} reloadKey={reloadKey} chatAsk={chatAsk} posture={posture} line={lineNow} station={board} next={heading?.next} trip={kind} ride={ride} />
          )}
        </>
      )}

      {askPlan && (
        <Sheet title={t("먼저 등록이 필요해요")} blockId="S077" onClose={() => setAskPlan(false)}>
          <div className="space-y-4 pb-2">
            <p className="text-[15px] leading-relaxed text-ink">
              {t("지하철 탑승역과 시각을 설정에 먼저 등록하면, 시간에 맞춰 탑승 방면을 자동으로 골라 드려요. 지금 설정으로 이동할까요?")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-block-id="B270"
                className="flex-1 rounded-2xl bg-brand py-3.5 text-[15px] font-semibold text-white active:opacity-90"
                onClick={() => {
                  setAskPlan(false);
                  onSettings?.();
                }}
              >
                {t("설정으로 이동")}
              </button>
              <button type="button" className="rounded-2xl bg-bg px-5 py-3.5 text-[15px] font-semibold text-sub" onClick={() => setAskPlan(false)}>
                {t("나중에")}
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {help && <LocationHelp onClose={() => setHelp(false)} />}
    </section>
  );
}




function NotOpen() {
  const t = useT();
  return <p className="rounded-2xl bg-lcSoft px-4 py-3 text-[14px] leading-relaxed text-brand">{t("앉아가기 매칭은 아직 준비 중이에요.")}</p>;
}

/** 지하철 출퇴근 정보가 없을 때: 설정에서 등록하도록 안내한다. */
function EmptyPlan({ onSettings }: { onSettings?: () => void }) {
  const t = useT();
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white px-4 py-4">
      <p className="text-[15px] font-semibold text-ink">{t("지하철 정보를 먼저 등록해 주세요")}</p>
      <p className="text-[13px] leading-relaxed text-sub">{t("설정에서 노선·역·시각을 저장하면, 시간에 맞춰 탑승 방면을 골라 드려요.")}</p>
      {onSettings && (
        <button type="button" className="rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white" onClick={onSettings}>
          {t("설정으로 이동")}
        </button>
      )}
    </div>
  );
}

/** '오늘' 카드 안에서 오늘의 노선·승차역·하차역을 바꾼다(이 기기, 오늘 하루). 설정의 등록은 그대로 둔다. */
function TodayEditor({ pilot, init, onSave, onReset }: { pilot: LineId[]; init: EditV; onSave: (v: EditV) => void; onReset: () => void }) {
  const t = useT();
  const [line, setLine] = useState<LineId>(init.line);
  const [board, setBoard] = useState(init.board);
  const [alight, setAlight] = useState(init.alight);
  const stations = [...new Set(LINE_STATIONS[line] ?? [])];
  const lines = ALL_LINES.filter((l) => pilot.includes(l.id) || l.id === init.line);
  const ok = stations.includes(board) && stations.includes(alight) && board !== alight;
  const pickLine = (l: LineId) => {
    setLine(l);
    const st = LINE_STATIONS[l] ?? [];
    if (!st.includes(board)) setBoard("");
    if (!st.includes(alight)) setAlight("");
  };
  return (
    <div data-block-id="S075" data-block-name="오늘 노선·역 바꾸기" className="space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("노선")}>
        {lines.map((l) => {
          const on = line === l.id;
          const c = lineColor(l.id);
          return (
            <button key={l.id} type="button" role="radio" aria-checked={on} onClick={() => pickLine(l.id)} className="min-h-[36px] rounded-full border-2 px-3 text-[13px] font-semibold" style={on ? { background: c.bg, borderColor: c.bg, color: c.text } : { background: "#FFFFFF", borderColor: c.bg, color: "#1F2937" }}>
              {t(l.name)}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[13px] text-sub">
          {t("승차역")}
          <select className={`${field} mt-1 py-2`} value={board} onChange={(e) => setBoard(e.target.value)}>
            <option value="">{t("역을 고르세요")}</option>
            {stations.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] text-sub">
          {t("하차역")}
          <select className={`${field} mt-1 py-2`} value={alight} onChange={(e) => setAlight(e.target.value)}>
            <option value="">{t("역을 고르세요")}</option>
            {stations.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-xl bg-brand py-2.5 text-[14px] font-semibold text-white disabled:opacity-40" disabled={!ok} onClick={() => onSave({ line, board, alight })}>
          {t("오늘 이렇게 타기")}
        </button>
        <button type="button" className="rounded-xl bg-bg px-4 py-2.5 text-[14px] text-sub" onClick={onReset}>
          {t("등록 정보로")}
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-sub">{t("오늘 하루 이 기기에서만 바뀌어요. 칸 추천과 앉았어요 알림도 바꾼 노선·역으로 보내요. 기본 노선은 설정에서 바꿔요.")}</p>
    </div>
  );
}
