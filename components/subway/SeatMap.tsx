"use client";
import { useState } from "react";
import { SEAT_BENCHES, parseSeat, seatId, seatLabel, type SeatPos } from "@/lib/subwayPosition";
import { useT } from "../ui";

/**
 * 차량 안을 위에서 내려다본 좌석 그림. 좌석을 눌러 고른다(readOnly면 표시만).
 * 위·아래 벽에 좌석이 있고, 문 4개(1~4번) 사이에 7석, 양 끝에 노약자석 3석이 있다.
 */
const U = 9; // 좌석 한 칸 너비
const DOOR = 16;
const X0 = 16;
const WALL_Y = { A: 22, B: 106 } as const;
const SEAT_H = 22;

type Seg = { kind: "bench"; bench: number; x: number } | { kind: "door"; door: number; x: number };

function layout(): Seg[] {
  const out: Seg[] = [];
  let x = X0;
  SEAT_BENCHES.forEach((n, b) => {
    out.push({ kind: "bench", bench: b, x });
    x += n * U;
    if (b < 4) {
      out.push({ kind: "door", door: b + 1, x });
      x += DOOR;
    }
  });
  return out;
}
const SEGS = layout();

/**
 * 그림의 왼쪽(1번 문 쪽)이 열차 앞쪽이다. 진행 방향을 보고 서면 그림의 위쪽 줄이 오른쪽, 아래쪽 줄이 왼쪽이다.
 * next: 다음역 이름(알면 화살표 옆에 함께 보여 준다).
 */
export default function SeatMap({ value, onChange, readOnly = false, car, next }: { value: string; onChange?: (seat: string) => void; readOnly?: boolean; car?: string; next?: string }) {
  const t = useT();
  const sel = parseSeat(value);
  // 휴대폰에서 좌석이 작아서, 그림을 누르면 그 구간을 아래에 크게 펼쳐 정확한 좌석을 고르게 한다.
  const [focus, setFocus] = useState<{ wall: "A" | "B"; bench: number } | null>(sel ? { wall: sel.wall, bench: sel.bench } : null);
  const pick = (p: SeatPos) => {
    if (readOnly || !onChange) return;
    setFocus({ wall: p.wall, bench: p.bench });
    onChange(seatId(p));
  };
  return (
    <figure className="space-y-2">
      <div data-block-id="C131" data-block-name="진행 방향" className="flex items-center gap-1.5 text-[13px] font-semibold text-violet">
        <svg width="28" height="12" viewBox="0 0 28 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M27 6H2M7 1L2 6l5 5" />
        </svg>
        <span>{t("진행 방향")}</span>
        {next && <span className="font-normal text-sub">· {t("다음역")} {next}</span>}
      </div>
      <svg viewBox="0 0 340 150" role={readOnly ? "img" : "group"} aria-label={t("차량 안 좌석 그림")} className="h-auto w-full select-none">
        {/* 차체 */}
        <rect x="2" y="12" width="336" height="126" rx="18" fill="#FFFFFF" stroke="#D9DEE8" strokeWidth="1.25" />
        {/* 통로 */}
        <line x1="14" y1="75" x2="326" y2="75" stroke="#E6E9F0" strokeWidth="1" strokeDasharray="4 4" />
        {SEGS.map((s) =>
          s.kind === "door" ? (
            <g key={`d${s.door}`}>
              <rect x={s.x} y="9" width={DOOR} height="6" rx="2" fill="#FFFFFF" stroke="#B9C2D3" strokeWidth="1" />
              <rect x={s.x} y="135" width={DOOR} height="6" rx="2" fill="#FFFFFF" stroke="#B9C2D3" strokeWidth="1" />
              <text x={s.x + DOOR / 2} y="79" textAnchor="middle" fontSize="10" fontWeight="600" fill="#6B7385">{s.door}</text>
            </g>
          ) : (
            (["A", "B"] as const).map((wall) =>
              Array.from({ length: SEAT_BENCHES[s.bench] }, (_, i) => {
                const p: SeatPos = { wall, bench: s.bench, index: i + 1 };
                const on = !!sel && seatId(sel) === seatId(p);
                const priority = s.bench === 0 || s.bench === 4;
                return (
                  <rect
                    key={`${wall}${s.bench}-${i}`}
                    x={s.x + i * U + 0.75}
                    y={WALL_Y[wall]}
                    width={U - 1.5}
                    height={SEAT_H}
                    rx="2.5"
                    fill={on ? "#7C3AED" : priority ? "#FFF4E5" : "#F3EEFF"}
                    stroke={on ? "#7C3AED" : priority ? "#F5C98B" : "#DCD3F7"}
                    strokeWidth="1"
                    role={readOnly ? undefined : "button"}
                    tabIndex={readOnly ? undefined : 0}
                    aria-label={readOnly ? undefined : seatLabel(p)}
                    aria-pressed={readOnly ? undefined : on}
                    style={{ cursor: readOnly ? "default" : "pointer" }}
                    onClick={() => pick(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pick(p);
                      }
                    }}
                  />
                );
              })
            )
          )
        )}
      </svg>
      {!readOnly && focus && (
        <div className="space-y-1.5">
          <p className="text-[12px] text-sub">
            {focus.wall === "A" ? t("진행 방향 오른쪽 줄") : t("진행 방향 왼쪽 줄")} · {focus.bench === 0 ? t("1번 문 앞 노약자석") : focus.bench === 4 ? t("4번 문 뒤 노약자석") : `${focus.bench}~${focus.bench + 1}${t("번 문 사이")}`}
          </p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${SEAT_BENCHES[focus.bench]}, minmax(0, 1fr))` }}>
            {Array.from({ length: SEAT_BENCHES[focus.bench] }, (_, i) => {
              const p: SeatPos = { wall: focus.wall, bench: focus.bench, index: i + 1 };
              const on = !!sel && seatId(sel) === seatId(p);
              return (
                <button key={i} type="button" aria-pressed={on} aria-label={seatLabel(p)} onClick={() => pick(p)} className={`min-h-[44px] rounded-lg border text-[14px] font-semibold ${on ? "border-violet bg-violet text-white" : "border-line bg-white text-ink"}`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <figcaption className="text-center text-[12px] text-sub">
        {car ? `${car}${t("번째 칸")} · ` : ""}
        {sel ? seatLabel(sel) : readOnly ? t("좌석을 아직 고르지 않았어요") : t("앉은 자리 근처를 누르면 아래에 크게 펼쳐져요. 숫자는 문 번호, 주황색은 노약자석이에요.")}
      </figcaption>
    </figure>
  );
}
