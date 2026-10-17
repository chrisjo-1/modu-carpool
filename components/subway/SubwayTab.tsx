"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Post, User } from "@/lib/types";
import type { SubwayPlan } from "@/lib/subway";
import { ALL_LINES } from "@/lib/subway";
import { api, useT } from "../ui";
import SubwayCarGuide from "./SubwayCarGuide";
import SubwayMatches from "./SubwayMatches";
import SeatSpotCard from "./SeatSpotCard";
import SubwayCall from "./SubwayCall";

// 안내 사진은 시트를 열 때만 불러온다.
const LocationHelp = dynamic(() => import("./LocationHelp"), { ssr: false });

/**
 * 하단 '지하철' 메뉴: ① 앉아갈 수 있는 정보 ② 내 자리 위치 ③ 매칭 정보, 그리고 보라색 CALL 버튼.
 * 지하철 출퇴근 등록은 '내 출퇴근 정보' 시트의 지하철 칸에서 한다.
 * 이 폴더와 App.tsx의 탭 연결 한 곳을 지우면 기능 전체를 뺄 수 있다.
 */
export default function SubwayTab({ user }: { user: User | null; toast: (m: string) => void }) {
  const t = useT();
  const [plan, setPlan] = useState<SubwayPlan | null>(null);
  const [days, setDays] = useState("");
  const [seatOn, setSeatOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);
  const [planDays, setPlanDays] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

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

  return (
    <section className="space-y-6 pb-24 pt-2" data-block-id="S070" data-block-name="지하철 탭">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold">{t("지하철")}</h2>
        <button type="button" className="text-[13px] font-medium text-violet" onClick={() => setHelp(true)}>{t("위치 찾는 법")}</button>
      </div>

      {/* ① 앉아갈 수 있는 정보 */}
      <div className="space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-[16px] font-semibold text-ink">{t("앉아갈 수 있는 정보")}</h3>
          {plan && (
            <p className="text-[13px] text-sub">
              {t(lineName)} {plan.board} → {plan.alight} · {plan.timeGo}
            </p>
          )}
        </div>
        {!loaded && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
        {loaded && plan && plan.board && <SubwayCarGuide line={plan.boardLine} station={plan.board} alight={plan.boardLine === plan.alightLine ? plan.alight : ""} timeGo={plan.timeGo} days={days} />}
        {loaded && !plan && <EmptyPlan />}
      </div>

      {/* ② 내 자리 위치 */}
      {loaded && seatOn && plan && (
        <div className="space-y-3">
          <h3 className="text-[16px] font-semibold text-ink">{t("내 자리 위치")}</h3>
          <SeatSpotCard line={plan.boardLine} />
        </div>
      )}

      {/* ③ 매칭 정보 */}
      <div className="space-y-3">
        <h3 className="text-[16px] font-semibold text-ink">{t("매칭 정보")}</h3>
        {!loaded && <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>}
        {loaded && !seatOn && <p className="rounded-2xl bg-violetSoft px-4 py-3 text-[14px] leading-relaxed text-violet">{t("앉아가기 매칭은 아직 준비 중이에요.")}</p>}
        {loaded && seatOn && !plan && <p className="text-[14px] text-sub">{t("지하철 출퇴근 정보를 등록하면 같은 열차를 타는 이웃과 매칭돼요.")}</p>}
        {loaded && seatOn && plan && <SubwayMatches myTime={plan.timeGo} myDays={planDays} reloadKey={reloadKey} />}
      </div>

      {loaded && seatOn && <SubwayCall hasPlan={!!plan} onSent={() => setReloadKey((k) => k + 1)} />}

      {help && <LocationHelp onClose={() => setHelp(false)} />}
    </section>
  );
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
