"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Post, User } from "@/lib/types";
import type { SubwayPlan } from "@/lib/subway";
import { ALL_LINES, LINE_STATIONS } from "@/lib/subway";
import { Segment, api, field, useT } from "../ui";
import { headingFor, headingsAt } from "@/lib/subwayRoute";
import SubwayCarGuide from "./SubwayCarGuide";
import SubwayMatches from "./SubwayMatches";
import SeatSpotCard from "./SeatSpotCard";
import SubwayCall from "./SubwayCall";

// 안내 사진은 시트를 열 때만 불러온다.
const LocationHelp = dynamic(() => import("./LocationHelp"), { ssr: false });

/**
 * 하단 '지하철' 메뉴: 오늘 출근 요약 + 위쪽 탭 [내 자리 | 매칭 | 앉을 칸], 그리고 보라색 CALL 버튼.
 * 지하철 출퇴근 등록은 '내 출퇴근 정보' 시트의 지하철 칸에서 한다.
 * 이 폴더와 App.tsx의 탭 연결 한 곳을 지우면 기능 전체를 뺄 수 있다.
 */
type View = "seat" | "match" | "car";
/** 오늘만 바꾼 탑승 정보(이 기기, 날짜가 바뀌면 무시). 매칭용 출퇴근 등록은 바꾸지 않는다. */
type Today = { date: string; board: string; next: string; time: string };
const TODAY_KEY = "modu.subwayToday";
const kstDate = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

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
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(TODAY_KEY) ?? "null") as Today | null;
      if (v && v.date === kstDate()) setTodayState(v);
    } catch {
      /* 무시 */
    }
  }, []);
  const setToday = (v: Today | null) => {
    setTodayState(v);
    try {
      if (v) localStorage.setItem(TODAY_KEY, JSON.stringify(v));
      else localStorage.removeItem(TODAY_KEY);
    } catch {
      /* 무시 */
    }
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

  if (!user) {
    return (
      <section className="space-y-3 pt-2">
        <h1 className="text-[28px] font-bold">{t("지하철 앉아가기")}</h1>
        <p className="text-[15px] leading-relaxed text-sub">{t("로그인하고 출퇴근 정보에서 지하철을 등록하면 앉아갈 수 있는 정보와 매칭을 보여 드려요.")}</p>
      </section>
    );
  }

  const lineName = plan ? ALL_LINES.find((l) => l.id === plan.boardLine)?.name ?? "" : "";
  const planHeading = plan && plan.boardLine === plan.alightLine ? headingFor(plan.boardLine, plan.board, plan.alight) : null;
  // 오늘만 바꾼 탑승역·방향·시간(이 기기). 없으면 등록한 출퇴근 정보를 쓴다.
  const board = today?.board || plan?.board || "";
  const timeNow = today?.time || plan?.timeGo || "";
  const heading = plan ? (today?.next ? headingsAt(plan.boardLine, board).find((h) => h.next === today.next) ?? null : board === plan.board ? planHeading : null) : null;

  return (
    <section className="space-y-4 pb-24 pt-2" data-block-id="S070" data-block-name="지하철 탭">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold">{t("지하철 앉아가기")}</h1>
        <button type="button" data-block-id="B260" className="min-h-0 text-[13px] font-medium text-violet" onClick={() => setHelp(true)}>{t("위치 찾는 법")}</button>
      </div>

      {!loaded && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {loaded && !plan && <EmptyPlan />}

      {loaded && plan && (
        <>
          {/* 오늘 출근 요약 */}
          <div data-block-id="C130" data-block-name="오늘 출근" className="rounded-2xl border border-violet/25 bg-violetSoft/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-violet">{t("오늘 출근")}{today && <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[11px]">{t("오늘만 변경")}</span>}</p>
              <button type="button" data-block-id="B262" data-block-name="오늘 탑승 정보 변경" className="min-h-0 py-1 text-[13px] font-semibold text-violet underline-offset-4 hover:underline" onClick={() => setEditing((v) => !v)}>
                {editing ? t("닫기") : t("변경")}
              </button>
            </div>
            <p className="mt-0.5 text-[16px] font-bold text-ink">
              <span className="mr-1.5 rounded-md bg-violet px-1.5 py-0.5 text-[12px] font-bold text-white">{t(lineName)}</span>
              {board}{board === plan.board ? ` → ${plan.alight}` : ` ${t("탑승")}`} <span className="num font-semibold text-violet">{timeNow}</span>
            </p>
            {heading && (
              <p className="mt-0.5 text-[13px] text-sub">
                {heading.terminal ? `${heading.terminal} ${t("방면")} · ` : ""}
                {t("다음역")} {heading.next}
              </p>
            )}
            {editing && (
              <TodayEditor
                line={plan.boardLine}
                init={{ board, next: heading?.next ?? "", time: timeNow }}
                onSave={(v) => {
                  setToday({ date: kstDate(), ...v });
                  setEditing(false);
                }}
                onReset={() => {
                  setToday(null);
                  setEditing(false);
                }}
                changed={!!today}
              />
            )}
          </div>

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

          {view === "car" && <SubwayCarGuide key={`${board}|${heading?.next ?? ""}|${timeNow}`} line={plan.boardLine} station={board} alight={!today && plan.boardLine === plan.alightLine ? plan.alight : ""} prefer={heading?.next ?? ""} timeGo={timeNow} days={days} />}
        </>
      )}

      {loaded && seatOn && <SubwayCall hasPlan={!!plan} onSent={() => { setReloadKey((k) => k + 1); pickView("match"); }} />}

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

/** '오늘 출근' 카드 안에서 오늘의 탑승역·방향·시간을 고친다(이 기기, 오늘 하루). */
function TodayEditor({ line, init, onSave, onReset, changed }: { line: string; init: { board: string; next: string; time: string }; onSave: (v: { board: string; next: string; time: string }) => void; onReset: () => void; changed: boolean }) {
  const t = useT();
  const [board, setBoard] = useState(init.board);
  const [next, setNext] = useState(init.next);
  const [time, setTime] = useState(init.time);
  const stations = [...new Set(LINE_STATIONS[line] ?? [])];
  const headings = headingsAt(line, board);
  const nextOk = headings.some((h) => h.next === next) ? next : headings[0]?.next ?? "";
  return (
    <div data-block-id="S075" data-block-name="오늘 탑승 정보 변경" className="mt-3 space-y-3 border-t border-violet/20 pt-3">
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
          {t("탑승 시간")}
          <input className={`${field} mt-1 py-2`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {headings.length > 0 && (
        <div className="space-y-1">
          <p className="text-[13px] text-sub">{t("방향")}</p>
          <div role="radiogroup" aria-label={t("방향")} className="flex flex-wrap gap-1.5">
            {headings.map((h) => {
              const on = nextOk === h.next;
              return (
                <button key={h.next} type="button" role="radio" aria-checked={on} onClick={() => setNext(h.next)} className={`min-h-[40px] rounded-xl border px-3 py-1 text-left text-[13px] ${on ? "border-violet bg-white font-semibold text-violet" : "border-line bg-white text-sub"}`}>
                  {h.terminal ? `${h.terminal} ${t("방면")}` : `${h.next} ${t("방향")}`}
                  <span className="block text-[11px] font-normal text-sub">{t("다음역")} {h.next}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className="flex-1 rounded-xl bg-violet py-2.5 text-[14px] font-semibold text-white disabled:opacity-40" disabled={!board || !/^\d{1,2}:\d{2}$/.test(time)} onClick={() => onSave({ board, next: nextOk, time })}>
          {t("오늘만 이렇게 보기")}
        </button>
        {changed && (
          <button type="button" className="rounded-xl bg-white px-3 py-2.5 text-[14px] text-sub" onClick={onReset}>
            {t("등록 정보로")}
          </button>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-sub">{t("오늘 하루 이 기기에서만 바뀌어요. 매칭에 쓰는 출퇴근 정보는 내 출퇴근 정보에서 고쳐 주세요.")}</p>
    </div>
  );
}
