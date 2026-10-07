"use client";
import { won } from "@/lib/fare";
import { Card, type Ride } from "./ui";

export default function Records({
  rides,
  cap,
  loggedIn,
  onDelete,
  goSettings,
}: {
  rides: Ride[];
  cap: number;
  loggedIn: boolean;
  onDelete: (id: string) => void;
  goSettings: () => void;
}) {
  const now = new Date();
  const month = rides.filter((r) => {
    const d = new Date(r.startedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const each = month.reduce((s, r) => s + r.perPerson, 0);
  const total = month.reduce((s, r) => s + r.total, 0);
  const pct = cap > 0 ? Math.min(100, Math.round((each / cap) * 100)) : 0;

  return (
    <section data-block-id="S002" data-block-name="기록" className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold">기록</h1>
        <p className="mt-1 text-sub">이번 달 누계와 운행별 정산</p>
      </header>

      <Card data-block-id="C010" data-block-name="월 누계" className="p-6">
        <p className="text-sm font-medium text-sub">{now.getMonth() + 1}월 1인 누계</p>
        <p className="num mt-1 text-5xl font-bold">{won(each)}원</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-sm text-sub">
          <span>권장 상한 {won(cap)}원</span>
          <span className="num">{pct}%</span>
        </div>
        <div className="mt-5 flex justify-between border-t border-line pt-4">
          <div>
            <p className="text-sm text-sub">총 운행</p>
            <p className="num text-2xl font-bold">{month.length}<span className="ml-0.5 text-sm font-medium">회</span></p>
          </div>
          <div className="text-right">
            <p className="text-sm text-sub">총액 합계</p>
            <p className="num text-2xl font-bold">{won(total)}원</p>
          </div>
        </div>
      </Card>

      {!loggedIn && (
        <button
          data-block-id="B020"
          data-block-name="로그인 안내"
          onClick={goSettings}
          className="w-full rounded-2xl bg-accentSoft px-4 py-3 text-left text-[15px]"
        >
          지금은 이 기기에만 저장돼요. <b className="font-semibold text-accent">로그인하면 기기를 바꿔도 유지됩니다.</b>
        </button>
      )}

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">최근 운행</h2>
        {rides.length === 0 ? (
          <Card className="px-6 py-10 text-center text-sub">아직 운행 기록이 없습니다.</Card>
        ) : (
          <Card className="divide-y divide-line">
            {rides.slice(0, 100).map((r) => {
              const d = new Date(r.startedAt);
              return (
                <article key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {d.getMonth() + 1}.{d.getDate()}{" "}
                      <span className="num font-normal text-sub">
                        {d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                    </p>
                    <p className="num truncate text-sm text-sub">
                      {(r.distanceM / 1000).toFixed(1)}km · {Math.max(1, Math.round(r.durationS / 60))}분 · {r.preset} · {r.passengers}명
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num font-semibold">{won(r.total)}원</p>
                    <p className="num text-sm text-accent">1인 {won(r.perPerson)}원</p>
                  </div>
                  <button
                    aria-label="이 기록 삭제"
                    className="min-h-0 shrink-0 px-1 py-2 text-sm text-sub underline"
                    onClick={() => {
                      if (window.confirm("이 운행 기록을 삭제할까요?")) onDelete(r.id);
                    }}
                  >
                    삭제
                  </button>
                </article>
              );
            })}
          </Card>
        )}
      </div>
    </section>
  );
}
