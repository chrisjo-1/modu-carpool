"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Post, User } from "@/lib/types";
import type { LineId, SubwayPlan } from "@/lib/subway";
import { ALL_LINES, LINE_STATIONS } from "@/lib/subway";
import { Segment, Sheet, api, field, useT } from "../ui";
import { headingsAt } from "@/lib/subwayRoute";
import SubwayCarGuide from "./SubwayCarGuide";
import SubwayMatches from "./SubwayMatches";
import SeatSpotCard from "./SeatSpotCard";
import SubwayCall, { type Posture, type SeatKey } from "./SubwayCall";
import { slotOf } from "@/lib/seatCar";
import RidePing from "./RidePing";
import ClothesMemo from "./ClothesMemo";
import DirectionToggle from "./DirectionToggle";

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
 * 오늘 탑승 정보(이 기기, 날짜가 바뀌면 무시). kind는 접속 시각으로 정한 출근·퇴근,
 * timeSet은 출발 시각을 직접 고쳤는지(아니면 접속 시각을 따른다), posture는 앉았는지 섰는지.
 */
type Today = { date: string; kind: Kind; board: string; next: string; time: string; timeSet: boolean; posture?: Posture };
type EditV = { board: string; time: string };
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
const lineOf = (p: SubwayPlan, k: Kind): LineId => (k === "go" ? p.boardLine : p.alightLine);
const timeOf = (p: SubwayPlan, k: Kind) => (k === "go" ? p.timeGo : p.timeBack);

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
  const p = prev && prev.kind === kind ? prev : null;
  return {
    date: kstDate(),
    kind,
    board: p?.board || stationOf(plan, kind),
    next: p?.next || (kind === "go" ? plan.boardNext : plan.backNext),
    time: p?.timeSet && p.time ? p.time : kstHM(),
    timeSet: !!p?.timeSet,
    posture: p?.posture ?? "",
  };
}

export default function SubwayTab({ user, onSettings }: { user: User | null; toast: (m: string) => void; onSettings?: () => void }) {
  const t = useT();
  const [plan, setPlan] = useState<SubwayPlan | null>(null);
  const [days, setDays] = useState("");
  const [seatOn, setSeatOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [askPlan, setAskPlan] = useState(false);
  const [planDays, setPlanDays] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // 내 자리 알리기의 "대화로 알리기" → 매칭 목록에서 매칭된 상대 대화를 연다.
  const [chatAsk, setChatAsk] = useState(0);
  const [today, setTodayState] = useState<Today | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  // 메뉴 안의 화면: 빈 값 = 두 기능 메뉴, seat = 앉을 칸 찾기, match = 매칭
  const [view, setView] = useState<"" | "seat" | "match">("");
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
        api<{ enabled: boolean }>("/api/seat/config"),
        api<{ plan: SubwayPlan | null; days: string }>("/api/seat/plan"),
        api<{ posts: Post[] }>("/api/posts?mine=1"),
      ]);
      if (!alive) return;
      setSeatOn(cfg.ok && !!cfg.data.enabled);
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

  // 탭을 열 때 한 번: 접속 시각으로 출근·퇴근을 고르고 출발 시각을 지금으로 맞춘다.
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
  const lineNow: LineId = plan ? lineOf(plan, kind) : "2";
  const board = today?.board || (plan ? stationOf(plan, kind) : "");
  const timeNow = today?.time || (plan ? timeOf(plan, kind) : "");
  const dirs = plan && board ? headingsAt(lineNow, board) : [];
  const heading = dirs.find((h) => h.next === today?.next) ?? dirs[0] ?? null;
  const lineName = ALL_LINES.find((l) => l.id === lineNow)?.name ?? "";
  const posture: Posture = today?.posture ?? "";
  // 요일은 화면에 보이지 않는다. 칸 기록 키에만 오늘 요일을 쓴다.
  const dayNow = new Date(Date.now() + 9 * 3600_000).getUTCDay();
  // 역을 바꾸면 이 역에서 이어지는 방면으로 맞춘다.
  const pickNext = (b: string) => {
    const hs = plan ? headingsAt(lineNow, b) : [];
    return hs.find((h) => h.next === today?.next)?.next ?? hs[0]?.next ?? "";
  };
  const switchKind = (k: Kind) => {
    if (plan) setToday(freshToday(plan, k, null));
    setEditing(false);
  };

  return (
    <section className="space-y-6 pb-10 pt-2" data-block-id="S070" data-block-name="지하철 탭">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold text-ink">{t("지하철 앉아가기")}</h1>
        <button type="button" data-block-id="B260" className="min-h-0 text-[13px] font-medium text-accent" onClick={() => setHelp(true)}>{t("위치 찾는 법")}</button>
      </div>

      {!loaded && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {loaded && !plan && <EmptyPlan onSettings={onSettings} />}

      {loaded && plan && today && (
        <>
          {/* ① 오늘 탑승: 시각으로 출근·퇴근을 고르고, 열차 진행 방향 화살표를 고른다. */}
          <Step n={1} title={t("오늘 탑승 방면")}>
            <div data-block-id="C130" data-block-name="오늘 탑승" className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-sub">
                  {!today.timeSet ? t("접속 시각 기준") : t("직접 정한 시각")}
                </p>
                <button type="button" data-block-id="B262" data-block-name="오늘 탑승 정보 변경" className="min-h-0 py-1 text-[13px] font-semibold text-accent underline-offset-4 hover:underline" onClick={() => setEditing((v) => !v)}>
                  {editing ? t("닫기") : t("변경")}
                </button>
              </div>
              {/* 방면 선택: 역 이름으로 두 방향을 보여 준다. 기본은 현재 시각에 맞춘 방면이다. */}
              {plan.back ? (
                <Segment
                  label={t("방면")}
                  value={kind}
                  onChange={switchKind}
                  accents={{ go: "accent", back: "accent" }}
                  options={[
                    ["go", `${plan.board} → ${plan.alight}`],
                    ["back", `${plan.alight} → ${plan.board}`],
                  ]}
                />
              ) : null}
              <p className="text-[17px] font-bold text-ink">
                <span className="mr-1.5 rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-bold text-white">{t(lineName)}</span>
                {board}
                {board === stationOf(plan, kind) ? ` → ${kind === "go" ? plan.alight : plan.board}` : ` ${t("탑승")}`}{" "}
                <span className="num font-semibold text-accent">{timeNow}</span>
              </p>
              <DirectionToggle line={lineNow} station={board} value={today.next} onChange={(next) => setToday({ ...today, next })} label={t("열차 진행 방향 (화살표)")} />
              {editing && (
                <TodayEditor
                  line={lineNow}
                  kind={kind}
                  init={{ board, time: timeNow }}
                  canSaveToPlan={board === stationOf(plan, kind)}
                  onSave={(v) => {
                    setToday({ ...today, date: kstDate(), kind, board: v.board, next: pickNext(v.board), time: v.time, timeSet: true });
                    setEditing(false);
                  }}
                  onSaveToPlan={async (v) => {
                    const next = pickNext(v.board);
                    const body = kind === "go" ? { ...plan, timeGo: v.time, boardNext: next, days } : { ...plan, timeBack: v.time, backNext: next, days };
                    const r = await api<{ plan: SubwayPlan; days: string }>("/api/seat/plan", "PUT", body);
                    if (!r.ok) return setSaveMsg(r.error);
                    setPlan(r.data.plan);
                    setToday({ ...today, date: kstDate(), kind, board: v.board, next, time: v.time, timeSet: true });
                    setEditing(false);
                    setSaveMsg("이 방면 정보에 저장했어요.");
                  }}
                  onReset={() => {
                    setToday({ ...freshToday(plan, kind, null), posture: today.posture ?? "" });
                    setEditing(false);
                  }}
                />
              )}
            </div>
            {saveMsg && <p role="status" className="px-1 pt-2 text-[13px] text-accent">{saveMsg}</p>}
          </Step>


          {!seatOn ? (
            <NotOpen />
          ) : view === "" ? (
            /* 메뉴: 두 기능만 보여 준다. */
            <div className="space-y-3" data-block-id="S071" data-block-name="지하철 메뉴">
              <MenuCard
                blockId="B280"
                title={t("앉을 칸 찾기")}
                desc={t("지금 시간·역 기준으로 앉을 확률이 높은 칸을 알려 드려요.")}
                onClick={() => setView("seat")}
              />
              <MenuCard
                blockId="B281"
                title={t("매칭")}
                desc={t("앉았어요를 누르면 같은 방향 분께 알리고, 수락하면 자리를 보여 드려요.")}
                onClick={() => setView("match")}
              />
            </div>
          ) : (
            <section className="space-y-5">
              <button type="button" data-block-id="B282" className="min-h-0 py-1 text-[14px] font-semibold text-accent" onClick={() => setView("")}>
                {t("← 메뉴")}
              </button>
              {view === "seat" ? (
                <>
                  <CarSection line={lineNow} board={board} alight={(board === stationOf(plan, kind) ? (kind === "go" ? plan.alight : plan.board) : "")} next={heading?.next ?? ""} timeNow={timeNow} days={days} kind={kind} />
                  <SubwayCall
                    hasPlan={!!plan}
                    posture={posture}
                    onPosture={(p) => setToday({ ...today, posture: p })}
                    onSent={() => setReloadKey((k) => k + 1)}
                    trip={kind}
                    seatKey={{ line: lineNow, station: board, dir: heading?.dir ?? "up", dow: String(dayNow), slot: slotOf(timeNow) }}
                  />
                  {/* 현재역·착의 메모는 필요할 때만 펼친다. */}
                  <details className="group" data-block-id="C133" data-block-name="더 알리기 (선택)">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {t("더 알리기 (선택)")}
                      <span className="text-[12px] font-normal text-sub group-open:hidden">{t("펼치기")}</span>
                      <span className="hidden text-[12px] font-normal text-sub group-open:inline">{t("접기")}</span>
                    </summary>
                    <div className="space-y-3 pt-3">
                      <RidePing line={lineNow} from={board} />
                      {posture === "sit" && <ClothesMemo />}
                    </div>
                  </details>
                  <div>
                    <p className="pb-2 text-[13px] text-sub">{t("내 자리 위치와 힌트 (선택) · 매칭된 상대에게만 보여요")}</p>
                    <SeatSpotCard line={lineNow} next={heading?.next} onChat={() => setChatAsk((k) => k + 1)} />
                  </div>
                </>
              ) : (
                <SubwayMatches myTime={timeNow} myDays={planDays} reloadKey={reloadKey} chatAsk={chatAsk} posture={posture} line={lineNow} next={heading?.next} trip={kind} />
              )}
            </section>
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
                className="flex-1 rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-white active:opacity-90"
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

/** 메뉴 카드: 제목과 한 줄 설명. 누르면 그 기능 화면으로 간다. */
function MenuCard({ blockId, title, desc, onClick }: { blockId: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" data-block-id={blockId} onClick={onClick} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-5 text-left shadow-card active:opacity-90">
      <span className="min-w-0">
        <span className="block text-[17px] font-bold text-ink">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-sub">{desc}</span>
      </span>
      <span aria-hidden className="shrink-0 text-[20px] text-sub">›</span>
    </button>
  );
}

/** 단계 제목: 번호 점 + 제목 + 한 줄 설명. */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-bold text-white">{n}</span>
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
        </div>
        {hint && <p className="pl-8 text-[13px] leading-relaxed text-sub">{hint}</p>}
      </div>
      <div className="pl-0">{children}</div>
    </section>
  );
}

/** 앉을 칸 찾기: 접혀 있다가 펼치면 칸을 추천한다. */
function CarSection({ line, board, alight, next, timeNow, days, kind }: { line: LineId; board: string; alight: string; next: string; timeNow: string; days: string; kind: Kind }) {
  const t = useT();
  return (
    <details open className="group rounded-2xl border border-line bg-white" data-block-id="S078" data-block-name="앉을 칸 확률">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-semibold text-ink">
        {t("앉을 칸 확률")}
        <span className="text-[13px] font-normal text-sub group-open:hidden">{t("열기")}</span>
        <span className="hidden text-[13px] font-normal text-sub group-open:inline">{t("접기")}</span>
      </summary>
      <div className="border-t border-line px-4 py-4">
        <SubwayCarGuide key={`${kind}|${board}|${next}|${timeNow}`} line={line} station={board} alight={alight} prefer={next} timeGo={timeNow} days={days} />
      </div>
    </details>
  );
}

function NotOpen() {
  const t = useT();
  return <p className="rounded-2xl bg-accentSoft px-4 py-3 text-[14px] leading-relaxed text-accent">{t("앉아가기 매칭은 아직 준비 중이에요.")}</p>;
}

/** 지하철 출퇴근 정보가 없을 때: 설정에서 등록하도록 안내한다. */
function EmptyPlan({ onSettings }: { onSettings?: () => void }) {
  const t = useT();
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white px-4 py-4">
      <p className="text-[15px] font-semibold text-ink">{t("지하철 정보를 먼저 등록해 주세요")}</p>
      <p className="text-[13px] leading-relaxed text-sub">{t("설정에서 노선·역·시각을 저장하면, 시간에 맞춰 탑승 방면을 골라 드려요.")}</p>
      {onSettings && (
        <button type="button" className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-white" onClick={onSettings}>
          {t("설정으로 이동")}
        </button>
      )}
    </div>
  );
}

/** '오늘' 카드 안에서 오늘의 탑승역·출발 시각을 고친다(이 기기, 오늘 하루). 방향은 카드의 화살표에서 고른다. */
function TodayEditor({ line, kind, init, onSave, onReset, canSaveToPlan, onSaveToPlan }: { line: LineId; kind: Kind; init: EditV; onSave: (v: EditV) => void; onReset: () => void; canSaveToPlan: boolean; onSaveToPlan: (v: EditV) => void }) {
  const t = useT();
  const [board, setBoard] = useState(init.board);
  const [time, setTime] = useState(init.time);
  const stations = [...new Set(LINE_STATIONS[line] ?? [])];
  const timeOk = /^\d{1,2}:\d{2}$/.test(time);
  return (
    <div data-block-id="S075" data-block-name="오늘 탑승 정보 변경" className="space-y-3 border-t border-line pt-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[13px] text-sub">
          {t("탑승역")}
          <select className={`${field} mt-1 py-2`} value={board} onChange={(e) => setBoard(e.target.value)}>
            {!stations.includes(board) && board && <option value={board}>{board}</option>}
            {stations.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] text-sub">
          {t("출발 시간")}
          <input className={`${field} mt-1 py-2`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="flex-1 rounded-xl bg-accent py-2.5 text-[14px] font-semibold text-white disabled:opacity-40" disabled={!board || !timeOk} onClick={() => onSave({ board, time })}>
          {t("오늘만 이렇게 보기")}
        </button>
        <button type="button" className="flex-1 rounded-xl border border-accent bg-white py-2.5 text-[14px] font-semibold text-accent disabled:opacity-40" disabled={!canSaveToPlan || !timeOk} onClick={() => onSaveToPlan({ board, time })}>
          {t("저장 (내 지하철 정보에도 반영)")}
        </button>
        <button type="button" className="rounded-xl bg-white px-3 py-2.5 text-[14px] text-sub" onClick={onReset}>
          {t("등록 정보로")}
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-sub">
        {canSaveToPlan ? t("오늘만 이렇게 보기는 이 기기에서만 바뀌어요. 저장하면 매칭에 쓰는 시각과 방면도 함께 바뀝니다.") : t("탑승역을 바꾸었다면 칸까지 골라야 하므로, 내 지하철 정보에서 저장해 주세요.")}
      </p>
    </div>
  );
}
