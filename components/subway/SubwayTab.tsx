"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Post, User } from "@/lib/types";
import type { LineId, SubwayPlan } from "@/lib/subway";
import { ALL_LINES, LINE_STATIONS } from "@/lib/subway";
import { Segment, api, field, useT } from "../ui";
import { headingsAt } from "@/lib/subwayRoute";
import SubwayCarGuide from "./SubwayCarGuide";
import SubwayMatches from "./SubwayMatches";
import SeatSpotCard from "./SeatSpotCard";
import SubwayCall from "./SubwayCall";
import DirectionToggle from "./DirectionToggle";

// 안내 사진은 시트를 열 때만 불러온다.
const LocationHelp = dynamic(() => import("./LocationHelp"), { ssr: false });

/**
 * 하단 '지하철' 메뉴: 오늘 출근(또는 퇴근) 요약 + 위쪽 탭 [내 자리 | 매칭 | 앉을 칸], 그리고 보라색 CALL 버튼.
 * 지하철 출퇴근 등록은 '내 출퇴근 정보' 시트의 지하철 칸에서 한다.
 * 이 폴더와 App.tsx의 탭 연결 한 곳을 지우면 기능 전체를 뺄 수 있다.
 */
type View = "seat" | "match" | "car";
type Kind = "go" | "back";
/**
 * 오늘 탑승 정보(이 기기, 날짜가 바뀌면 무시). kind는 접속 시각으로 정한 출근·퇴근,
 * timeSet은 출발 시각을 직접 고쳤는지(아니면 접속 시각을 따른다). 매칭용 출퇴근 등록은 여기서 바꾸지 않는다.
 */
type Today = { date: string; kind: Kind; board: string; next: string; time: string; timeSet: boolean };
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
 * 접속 시각으로 출근·퇴근을 고른다. 출근 시각 전 → 출근, 출근 이후 퇴근 시각 전 → 퇴근,
 * 퇴근 시각이 지나면 다음 날 출근으로 본다. 퇴근을 등록하지 않았으면 항상 출근.
 */
function autoKind(plan: SubwayPlan, hm: string): Kind {
  const now = toMin(hm);
  const go = toMin(plan.timeGo);
  const back = plan.back ? toMin(plan.timeBack) : -1;
  if (back < 0 || now < go) return "go";
  return now < back ? "back" : "go";
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
 * 같은 종류로 이미 고친 탑승역·방향·직접 고친 시각은 이어서 쓴다.
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
  };
}

export default function SubwayTab({ user }: { user: User | null; toast: (m: string) => void }) {
  const t = useT();
  const [plan, setPlan] = useState<SubwayPlan | null>(null);
  const [days, setDays] = useState("");
  const [seatOn, setSeatOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [planDays, setPlanDays] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // 내 자리 알리기의 "대화로 알리기" → 매칭 탭에서 매칭된 상대 대화를 연다.
  const [chatAsk, setChatAsk] = useState(0);
  const [today, setTodayState] = useState<Today | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const initRef = useRef(false);
  const setToday = (v: Today) => {
    setTodayState(v);
    storeToday(v);
  };
  // 위쪽 탭: 내 자리 / 매칭 / 앉을 칸. 마지막으로 본 탭을 이 기기에 기억한다.
  const [view, setView] = useState<View>(() => {
    try {
      const v = sessionStorage.getItem("modu.subwayView");
      if (v === "seat" || v === "match" || v === "car") return v;
    } catch {
      /* 무시 */
    }
    return "seat";
  });
  const pickView = (v: View) => {
    setView(v);
    try {
      sessionStorage.setItem("modu.subwayView", v);
    } catch {
      /* 무시 */
    }
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

  if (!user) {
    return (
      <section className="space-y-3 pt-2">
        <h1 className="text-[28px] font-bold">{t("지하철 앉아가기")}</h1>
        <p className="text-[15px] leading-relaxed text-sub">{t("로그인하고 출퇴근 정보에서 지하철을 등록하면 앉아갈 수 있는 정보와 매칭을 보여 드려요.")}</p>
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
    <section className="space-y-4 pb-24 pt-2" data-block-id="S070" data-block-name="지하철 탭">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold">{t("지하철 앉아가기")}</h1>
        <button type="button" data-block-id="B260" className="min-h-0 text-[13px] font-medium text-violet" onClick={() => setHelp(true)}>{t("위치 찾는 법")}</button>
      </div>

      {!loaded && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {loaded && !plan && <EmptyPlan />}

      {loaded && plan && today && (
        <>
          {/* 오늘 출근(퇴근) 요약: 접속 시각으로 종류를 고르고, 진행 방향 화살표를 고른다. */}
          <div data-block-id="C130" data-block-name="오늘 출근" className="space-y-3 rounded-2xl border border-violet/25 bg-violetSoft/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-violet">
                {kind === "go" ? t("오늘 출근") : t("오늘 퇴근")}
                {!today.timeSet && <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[11px]">{t("접속 시각")}</span>}
              </p>
              <button type="button" data-block-id="B262" data-block-name="오늘 탑승 정보 변경" className="min-h-0 py-1 text-[13px] font-semibold text-violet underline-offset-4 hover:underline" onClick={() => setEditing((v) => !v)}>
                {editing ? t("닫기") : t("변경")}
              </button>
            </div>
            {plan.back ? (
              <Segment
                label={t("출근·퇴근")}
                value={kind}
                onChange={switchKind}
                accents={{ go: "violet", back: "violet" }}
                options={[
                  ["go", t("출근")],
                  ["back", t("퇴근")],
                ]}
              />
            ) : (
              <p className="text-[12px] text-sub">{t("퇴근도 등록하면 시간에 따라 출근·퇴근이 자동으로 바뀌어요.")}</p>
            )}
            <p className="text-[16px] font-bold text-ink">
              <span className="mr-1.5 rounded-md bg-violet px-1.5 py-0.5 text-[12px] font-bold text-white">{t(lineName)}</span>
              {board}
              {board === stationOf(plan, kind) ? ` → ${kind === "go" ? plan.alight : plan.board}` : ` ${t("탑승")}`}{" "}
              <span className="num font-semibold text-violet">{timeNow}</span>
            </p>
            {plan && board && (
              <DirectionToggle
                line={lineNow}
                station={board}
                value={today.next}
                onChange={(next) => setToday({ ...today, next })}
                label={t("열차 진행 방향 (화살표)")}
              />
            )}
            {editing && (
              <TodayEditor
                line={lineNow}
                kind={kind}
                init={{ board, time: timeNow }}
                canSaveToPlan={board === stationOf(plan, kind)}
                onSave={(v) => {
                  setToday({ date: kstDate(), kind, board: v.board, next: pickNext(v.board), time: v.time, timeSet: true });
                  setEditing(false);
                }}
                onSaveToPlan={async (v) => {
                  const next = pickNext(v.board);
                  const body = kind === "go" ? { ...plan, timeGo: v.time, boardNext: next, days } : { ...plan, timeBack: v.time, backNext: next, days };
                  const r = await api<{ plan: SubwayPlan; days: string }>("/api/seat/plan", "PUT", body);
                  if (!r.ok) return setSaveMsg(r.error);
                  setPlan(r.data.plan);
                  setToday({ date: kstDate(), kind, board: v.board, next, time: v.time, timeSet: true });
                  setEditing(false);
                  setSaveMsg(kind === "go" ? "내 출근 정보에 저장했어요." : "내 퇴근 정보에 저장했어요.");
                }}
                onReset={() => {
                  setToday(freshToday(plan, kind, null));
                  setEditing(false);
                }}
              />
            )}
          </div>
          {saveMsg && <p role="status" className="px-1 text-[13px] text-violet">{saveMsg}</p>}

          {kind === "back" ? (
            <div className="space-y-3">
              <p className="rounded-2xl bg-violetSoft px-4 py-3 text-[14px] leading-relaxed text-violet">
                {t("지금은 퇴근 시간이에요. 앉을 칸 안내만 보여 드려요. 자리 알리기와 매칭은 출근 기준이에요.")}
              </p>
              <SubwayCarGuide
                key={`back|${board}|${heading?.next ?? ""}|${timeNow}`}
                line={lineNow}
                station={board}
                alight={plan.boardLine === plan.alightLine && board === plan.alight ? plan.board : ""}
                prefer={heading?.next ?? ""}
                timeGo={timeNow}
                days={days}
              />
            </div>
          ) : (
            <>
              <Segment
                label={t("지하철 메뉴")}
                value={view}
                onChange={pickView}
                accents={{ seat: "violet", car: "violet", match: "violet" }}
                options={[
                  ["seat", t("내 자리 알리기")],
                  ["match", t("매칭")],
                  ["car", t("앉을 칸 찾기")],
                ]}
              />

              {view === "seat" &&
                (seatOn ? (
                  <div className="space-y-2">
                    <p className="text-[13px] leading-relaxed text-sub">{t("자리를 양보할 분이 앉은 자리를 알려 주는 곳이에요. 칸과 좌석을 그림에서 눌러 주세요. 그림으로 짚기 어려우면 대화로 알려도 돼요. 매칭된 상대에게만 보여요.")}</p>
                    <SeatSpotCard
                      line={plan.boardLine}
                      next={heading?.next}
                      onChat={() => {
                        setChatAsk((k) => k + 1);
                        pickView("match");
                      }}
                    />
                  </div>
                ) : (
                  <NotOpen />
                ))}

              {view === "match" && (seatOn ? <SubwayMatches myTime={plan.timeGo} myDays={planDays} reloadKey={reloadKey} chatAsk={chatAsk} /> : <NotOpen />)}

              {view === "car" && (
                <SubwayCarGuide
                  key={`go|${board}|${heading?.next ?? ""}|${timeNow}`}
                  line={plan.boardLine}
                  station={board}
                  alight={board === plan.board && plan.boardLine === plan.alightLine ? plan.alight : ""}
                  prefer={heading?.next ?? ""}
                  timeGo={timeNow}
                  days={days}
                />
              )}
            </>
          )}
        </>
      )}

      {loaded && seatOn && kind === "go" && <SubwayCall hasPlan={!!plan} onSent={() => { setReloadKey((k) => k + 1); pickView("match"); }} />}

      {help && <LocationHelp onClose={() => setHelp(false)} />}
    </section>
  );
}

function NotOpen() {
  const t = useT();
  return <p className="rounded-2xl bg-violetSoft px-4 py-3 text-[14px] leading-relaxed text-violet">{t("앉아가기 매칭은 아직 준비 중이에요.")}</p>;
}

/** 지하철 출퇴근 정보가 없을 때: 어디서 등록하는지 알려 준다. */
function EmptyPlan() {
  const t = useT();
  return (
    <div className="space-y-1 rounded-2xl border border-line bg-white px-4 py-4">
      <p className="text-[15px] font-semibold text-ink">{t("지하철 출퇴근 정보를 먼저 등록해 주세요")}</p>
      <p className="text-[13px] leading-relaxed text-sub">{t("내 출퇴근 정보 → 지하철에서 노선·역·탑승 시각을 저장하면, 여기서 혼잡도와 앉을 가능성이 높은 칸을 바로 보여 드려요.")}</p>
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
    <div data-block-id="S075" data-block-name="오늘 탑승 정보 변경" className="space-y-3 border-t border-violet/20 pt-3">
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
        <button type="button" className="flex-1 rounded-xl bg-violet py-2.5 text-[14px] font-semibold text-white disabled:opacity-40" disabled={!board || !timeOk} onClick={() => onSave({ board, time })}>
          {t("오늘만 이렇게 보기")}
        </button>
        <button type="button" className="flex-1 rounded-xl border border-violet bg-white py-2.5 text-[14px] font-semibold text-violet disabled:opacity-40" disabled={!canSaveToPlan || !timeOk} onClick={() => onSaveToPlan({ board, time })}>
          {kind === "go" ? t("저장 (내 출근 정보에도 반영)") : t("저장 (내 퇴근 정보에도 반영)")}
        </button>
        <button type="button" className="rounded-xl bg-white px-3 py-2.5 text-[14px] text-sub" onClick={onReset}>
          {t("등록 정보로")}
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-sub">
        {canSaveToPlan ? t("오늘만 이렇게 보기는 이 기기에서만 바뀌어요. 저장하면 매칭에 쓰는 시각과 방면도 함께 바뀝니다.") : t("탑승역을 바꾸었다면 칸까지 골라야 하므로, 내 출퇴근 정보에서 저장해 주세요.")}
      </p>
    </div>
  );
}
