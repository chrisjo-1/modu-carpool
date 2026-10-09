"use client";
import { useEffect, useState } from "react";
import { estimate, type FareEstimate } from "@/lib/fare";
import type { Post } from "@/lib/types";
import { money, useLang, useT } from "./ui";

/** 글 상세: 이 경로를 택시·대중교통으로 가면 드는 예상 비용 */
export default function FareCard({ post }: { post: Post }) {
  const t = useT();
  const lang = useLang();
  const [est, setEst] = useState<(FareEstimate & { rough: boolean }) | null>(null);
  const [failed, setFailed] = useState(false);
  const ok = post.originLat != null && post.originLng != null && post.destLat != null && post.destLng != null;

  useEffect(() => {
    if (!ok) return;
    let alive = true;
    fetch(`/api/route?olat=${post.originLat}&olng=${post.originLng}&dlat=${post.destLat}&dlng=${post.destLng}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.meters > 0) setEst({ ...estimate(j.meters, j.seconds, post.departAt), rough: j.source !== "road" });
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [ok, post.originLat, post.originLng, post.destLat, post.destLng, post.departAt]);

  if (!ok || failed) return null;
  if (!est) return <div className="h-28 animate-pulse rounded-2xl bg-bg" aria-hidden />;

  const carpool = post.cost === "fixed" ? post.price ?? 0 : post.cost === "free" ? 0 : null;
  const save = carpool != null ? est.taxi.low - carpool : null;
  return (
    <section data-block-id="C013" data-block-name="예상 비용" className="space-y-2 rounded-2xl border border-line p-4">
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{t("이 경로 예상 비용")}</span>
        <span className="num text-sub">{est.rough ? "≈ " : ""}{est.km}km · {t("약")} {est.min}{t("분")}</span>
      </p>
      <dl className="space-y-1.5 text-[15px]">
        <div className="flex justify-between gap-3">
          <dt className="text-sub">{t("택시")}{est.taxi.night ? <span className="ml-1 text-xs text-warn">{t("심야할증")} {est.taxi.night}%</span> : null}</dt>
          <dd className="num font-semibold">{money(est.taxi.low, lang)} ~ {money(est.taxi.high, lang)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-sub">{t("대중교통 (1인)")}</dt>
          <dd className="num font-semibold">{est.transit != null ? `${t("약")} ${money(est.transit, lang)}` : t("장거리라 계산하지 않아요")}</dd>
        </div>
        {carpool != null && (
          <div className="flex justify-between gap-3 border-t border-line pt-1.5">
            <dt className="text-sub">{t("이 카풀 (1인)")}</dt>
            <dd className="num font-semibold text-accent">{carpool ? money(carpool, lang) : t("무료")}{save != null && save > 0 && <span className="ml-1 text-xs font-normal text-sub">({t("택시보다")} {money(save, lang)} {t("절약")})</span>}</dd>
          </div>
        )}
      </dl>
      <p className="text-[12px] leading-relaxed text-sub">{t("서울 중형택시·수도권 교통카드 요금으로 계산한 참고값이에요. 실제 요금은 교통 상황과 지역에 따라 달라요.")}</p>
    </section>
  );
}
