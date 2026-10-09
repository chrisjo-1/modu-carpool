"use client";
import { useEffect, useState } from "react";

type Series = Record<"signups" | "posts" | "requests" | "accepted" | "messages" | "attend", number[]>;
type Data = { days: string[]; series: Series; totals: Record<string, number> };

const CHARTS: [keyof Series, string][] = [
  ["signups", "신규 가입"],
  ["posts", "새 카풀 글"],
  ["requests", "카풀 신청"],
  ["accepted", "성사(수락)"],
  ["messages", "채팅 메시지"],
  ["attend", "출석(활동 회원)"],
];
const TILES: [string, string][] = [
  ["users", "전체 회원"],
  ["verified", "이메일 인증"],
  ["live", "모집 중인 글"],
  ["accepted", "누적 성사"],
  ["push", "푸시 구독 회원"],
  ["alerts", "경로 알림 등록"],
  ["marketing", "마케팅 수신 동의"],
  ["legacy", "워프에서 이전"],
];
const ACCENT = "#2F6BFF";
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 단일 계열 막대 차트(30일). 마우스를 올리면 그날 값을 보여 준다. */
function Bars({ days, values, label }: { days: string[]; values: number[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 96;
  const max = Math.max(1, ...values);
  const step = W / values.length;
  const bw = Math.max(2, step - 2); // 막대 사이 2px
  const sum = values.reduce((a, b) => a + b, 0);
  const last7 = values.slice(-7).reduce((a, b) => a + b, 0);
  const prev7 = values.slice(-14, -7).reduce((a, b) => a + b, 0);
  const delta = prev7 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
  const h = hover ?? values.length - 1;
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-card">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink">{label}</span>
        <span className="text-[12px] text-sub">30일 <b className="num text-ink">{fmt(sum)}</b></span>
      </figcaption>
      <p className="mt-1 text-[12px] text-sub">
        최근 7일 <b className="num text-ink">{fmt(last7)}</b>
        {delta !== null && <span className="num ml-1">({delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% 전주 대비)</span>}
      </p>
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label={`${label} 최근 30일 일별 추이`} onMouseLeave={() => setHover(null)}>
          <line x1={0} x2={W} y1={H} y2={H} stroke="#E5E8EE" strokeWidth={1} />
          {values.map((v, i) => {
            const bh = v ? Math.max(2, (v / max) * (H - 6)) : 0;
            const x = i * step + (step - bw) / 2;
            const r = Math.min(4, bw / 2, bh);
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
                {bh > 0 && (
                  <path
                    d={`M${x},${H} V${H - bh + r} Q${x},${H - bh} ${x + r},${H - bh} H${x + bw - r} Q${x + bw},${H - bh} ${x + bw},${H - bh + r} V${H} Z`}
                    fill={ACCENT}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                )}
              </g>
            );
          })}
          <text x={0} y={H + 12} fontSize={10} fill="#8A93A3">{md(days[0])}</text>
          <text x={W} y={H + 12} fontSize={10} fill="#8A93A3" textAnchor="end">{md(days[days.length - 1])}</text>
        </svg>
        <p className="num mt-1 text-[12px] text-sub" aria-live="polite">
          {md(days[h])} · <b className="text-ink">{fmt(values[h])}</b>
          {hover === null && " (오늘)"}
        </p>
      </div>
    </figure>
  );
}

/** 관리자 > 통계 */
export default function AdminStats() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [table, setTable] = useState(false);
  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((j) => (j.days ? setD(j) : setErr(j.error ?? "불러오지 못했습니다.")))
      .catch(() => setErr("불러오지 못했습니다."));
  }, []);
  if (err) return <p className="text-warn">{err}</p>;
  if (!d) return <p className="text-sub">불러오는 중…</p>;
  const rate = d.totals.requests ? Math.round((d.totals.accepted / d.totals.requests) * 100) : 0;
  return (
    <section data-block-id="A202" data-block-name="통계" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map(([k, label]) => (
          <div key={k} className="rounded-2xl bg-white p-4 shadow-card">
            <p className="text-[13px] text-sub">{label}</p>
            <p className="num mt-1 text-[22px] font-bold text-ink">{fmt(d.totals[k] ?? 0)}</p>
            {k === "accepted" && <p className="text-[12px] text-sub">신청 대비 {rate}%</p>}
            {k === "verified" && d.totals.users > 0 && <p className="text-[12px] text-sub">{Math.round((d.totals.verified / d.totals.users) * 100)}%</p>}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-sub">최근 30일 · 한국 시간 · 테스트 회원 제외</p>
        <button data-block-id="B204" className="min-h-0 rounded-lg bg-white px-3 py-1.5 text-[14px] text-sub shadow-card" aria-pressed={table} onClick={() => setTable((v) => !v)}>{table ? "차트로 보기" : "표로 보기"}</button>
      </div>
      {table ? (
        <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-card">
          <table className="w-full min-w-[560px] text-right text-[13px]">
            <thead className="text-sub">
              <tr><th className="py-1 text-left font-normal">날짜</th>{CHARTS.map(([, l]) => <th key={l} className="py-1 font-normal">{l}</th>)}</tr>
            </thead>
            <tbody className="num">
              {[...d.days].reverse().map((day, ri) => {
                const i = d.days.length - 1 - ri;
                return (
                  <tr key={day} className="border-t border-line">
                    <td className="py-1 text-left">{day}</td>
                    {CHARTS.map(([k]) => <td key={k} className="py-1">{fmt(d.series[k][i])}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHARTS.map(([k, label]) => <Bars key={k} days={d.days} values={d.series[k]} label={label} />)}
        </div>
      )}
    </section>
  );
}
