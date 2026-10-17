"use client";
import { useEffect, useState } from "react";
import type { Post, User } from "@/lib/types";
import { EMPTY_PLAN, planProblem, type SubwayPlan } from "@/lib/subway";
import { api, btnGhost, btnPrimary, useT } from "../ui";
import dynamic from "next/dynamic";
import SubwayPanel from "./SubwayPanel";
import SubwayMatches from "./SubwayMatches";

// 안내 사진은 시트를 열 때만 불러온다.
const LocationHelp = dynamic(() => import("./LocationHelp"), { ssr: false });

/**
 * 하단 '지하철' 탭: 앉아가기 등록과 탑승 칸·입구 안내를 함께 관리한다.
 * 이 폴더와 App.tsx의 탭 연결 한 곳을 지우면 기능 전체를 뺄 수 있다.
 */
export default function SubwayTab({ user, toast }: { user: User | null; toast: (m: string) => void }) {
  const t = useT();
  const [plan, setPlan] = useState<SubwayPlan>(EMPTY_PLAN);
  const [days, setDays] = useState("");
  const [seatOn, setSeatOn] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [help, setHelp] = useState(false);

  // 요일은 출퇴근 정보의 요일을 그대로 쓴다. 없으면 등록 기록의 요일을 쓴다.
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
      if (mine.ok && mine.data.plan) {
        setPlan(mine.data.plan);
        setHasPlan(true);
      }
      const regular = posts.ok ? posts.data.posts.find((p) => p.regular && p.days) : undefined;
      setDays(regular?.days || (mine.ok ? mine.data.days : "") || "");
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const save = async () => {
    if (!seatOn || !days) return;
    setBusy(true);
    const r = await api<{ plan: SubwayPlan; days: string }>("/api/seat/plan", "PUT", { ...plan, days });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setHasPlan(true);
    toast(t("앉아가기 등록을 저장했어요."));
  };

  const cancel = async () => {
    setBusy(true);
    const r = await api("/api/seat/plan", "DELETE");
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setPlan(EMPTY_PLAN);
    setHasPlan(false);
    toast(t("앉아가기 등록을 해제했어요."));
  };

  if (!user) {
    return (
      <section className="space-y-3 pt-2">
        <h2 className="text-xl font-bold">{t("지하철")}</h2>
        <p className="text-[15px] leading-relaxed text-sub">{t("로그인하면 앉아가기 등록을 저장할 수 있어요. 탑승 칸 안내는 로그인 없이도 볼 수 있어요.")}</p>
      </section>
    );
  }

  const problem = planProblem(plan);
  return (
    <section className="space-y-5 pt-2" data-block-id="S070" data-block-name="지하철 탭">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">{t("지하철")}</h2>
        <p className="text-[14px] leading-relaxed text-sub">{t("앉아가기 등록과 앉을 가능성이 높은 탑승 칸을 함께 볼 수 있어요.")}</p>
        <button type="button" className="text-[13px] font-medium text-violet" onClick={() => setHelp(true)}>{t("위치 찾는 법 보기")}</button>
      </div>

      {loaded && seatOn && <SubwayMatches onHelp={() => setHelp(true)} />}

      {loaded && !seatOn && (
        <p className="rounded-2xl bg-violetSoft px-4 py-3 text-[14px] leading-relaxed text-violet">{t("앉아가기 등록은 아직 준비 중이에요. 칸 안내는 먼저 볼 수 있어요.")}</p>
      )}
      {loaded && seatOn && !days && (
        <p className="text-[14px] leading-relaxed text-sub">{t("출퇴근 정보를 먼저 등록하면 그 요일을 함께 써요.")}</p>
      )}

      <div className="space-y-3 rounded-3xl bg-white p-4 shadow-[0_2px_12px_rgba(20,30,60,0.06)]">
        <SubwayPanel plan={plan} setPlan={setPlan} days={days} />
      </div>

      <div className="space-y-2">
        <button type="button" data-block-id="B061" data-block-name="앉아가기 저장" className={btnPrimary} disabled={busy || !seatOn || !days || !!problem} onClick={save}>
          {busy ? t("처리 중…") : seatOn ? t("앉아가기 저장") : t("준비 중")}
        </button>
        {problem && <p className="text-center text-[13px] text-sub">{t(problem)}</p>}
        {hasPlan && (
          <button type="button" className={btnGhost} disabled={busy} onClick={cancel}>
            {t("앉아가기 등록 해제")}
          </button>
        )}
      </div>
      {help && <LocationHelp onClose={() => setHelp(false)} />}
    </section>
  );
}
