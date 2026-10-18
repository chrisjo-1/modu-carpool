"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Post, User } from "@/lib/types";
import type { SubwayPlan } from "@/lib/subway";
import { ALL_LINES } from "@/lib/subway";
import { Segment, api, useT } from "../ui";
import { headingFor } from "@/lib/subwayRoute";
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

export default function SubwayTab({ user }: { user: User | null; toast: (m: string) => void }) {
  const t = useT();
  const [plan, setPlan] = useState<SubwayPlan | null>(null);
  const [days, setDays] = useState("");
  const [seatOn, setSeatOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [planDays, setPlanDays] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
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
        <h2 className="text-xl font-bold">{t("지하철")}</h2>
        <p className="text-[15px] leading-relaxed text-sub">{t("로그인하고 출퇴근 정보에서 지하철을 등록하면 앉아갈 수 있는 정보와 매칭을 보여 드려요.")}</p>
      </section>
    );
  }

  const lineName = plan ? ALL_LINES.find((l) => l.id === plan.boardLine)?.name ?? "" : "";
  const heading = plan && plan.boardLine === plan.alightLine ? headingFor(plan.boardLine, plan.board, plan.alight) : null;

  return (
    <section className="space-y-4 pb-24 pt-2" data-block-id="S070" data-block-name="지하철 탭">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold">{t("지하철")}</h2>
        <button type="button" data-block-id="B260" className="min-h-0 text-[13px] font-medium text-violet" onClick={() => setHelp(true)}>{t("위치 찾는 법")}</button>
      </div>

      {!loaded && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
      {loaded && !plan && <EmptyPlan />}

      {loaded && plan && (
        <>
          {/* 오늘 출근 요약 */}
          <div data-block-id="C130" data-block-name="오늘 출근" className="rounded-2xl border border-violet/25 bg-violetSoft/60 px-4 py-3">
            <p className="text-[12px] font-semibold text-violet">{t("오늘 출근")}</p>
            <p className="mt-0.5 text-[16px] font-bold text-ink">
              <span className="mr-1.5 rounded-md bg-violet px-1.5 py-0.5 text-[12px] font-bold text-white">{t(lineName)}</span>
              {plan.board} → {plan.alight} <span className="num font-semibold text-violet">{plan.timeGo}</span>
            </p>
            {heading && (
              <p className="mt-0.5 text-[13px] text-sub">
                {heading.terminal ? `${heading.terminal} ${t("방면")} · ` : ""}
                {t("다음역")} {heading.next}
              </p>
            )}
          </div>

          <Segment
            label={t("지하철 메뉴")}
            value={view}
            onChange={pickView}
            accents={{ seat: "violet", car: "violet", match: "violet" }}
            options={[
              ["seat", t("내 자리")],
              ["match", t("매칭")],
              ["car", t("앉을 칸")],
            ]}
          />

          {view === "seat" &&
            (seatOn ? (
              <div className="space-y-2">
                <p className="text-[13px] leading-relaxed text-sub">{t("열차에 앉으면 칸과 좌석을 그림에서 눌러 주세요. 매칭된 상대에게만 보여요.")}</p>
                <SeatSpotCard line={plan.boardLine} />
              </div>
            ) : (
              <NotOpen />
            ))}

          {view === "match" && (seatOn ? <SubwayMatches myTime={plan.timeGo} myDays={planDays} reloadKey={reloadKey} /> : <NotOpen />)}

          {view === "car" && <SubwayCarGuide line={plan.boardLine} station={plan.board} alight={plan.boardLine === plan.alightLine ? plan.alight : ""} timeGo={plan.timeGo} days={days} />}
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
