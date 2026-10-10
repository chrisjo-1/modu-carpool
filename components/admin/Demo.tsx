"use client";
import { useCallback, useEffect, useState } from "react";

type Row = { id: string; origin: string; dest: string; depart_at: number; role: string; kind: string; cost: string; price: number; regular: boolean; days: string; time_go: string; status: string; taxi_share: boolean; demo_shown: boolean; created_at: number; name: string };
type Data = { posts: Row[]; max: number };

const COST: Record<string, string> = { free: "무료", fixed: "금액", meter: "미터기 나눔" };
const when = (ms: number) => new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 관리자 > 임시글: 예시 게시물을 만들고, 글별로 노출·숨김·삭제를 고른다. */
export default function AdminDemo() {
  const [d, setD] = useState<Data | null>(null);
  const [count, setCount] = useState(10);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/demo");
    if (r.status === 401) return setMsg("관리자 로그인이 필요합니다. 새로고침 후 다시 들어가 주세요.");
    const j = await r.json().catch(() => null);
    if (j?.posts) setD(j);
    else setMsg(j?.error ?? "불러오지 못했습니다.");
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (req: Promise<Response>, done: string) => {
    setBusy(true);
    const r = await req;
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? done : j.error ?? "처리하지 못했습니다.");
    load();
  };
  const create = () => run(fetch("/api/admin/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", count }) }), `임시 게시물 ${count}개를 만들었습니다.`);
  const setShown = (id: string | null, shown: boolean) =>
    run(fetch("/api/admin/demo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id, shown } : { all: true, shown }) }), shown ? "노출로 바꿨습니다." : "숨겼습니다.");
  const remove = (id: string | null) => {
    if (!window.confirm(id ? "이 임시 게시물을 삭제할까요?" : "임시 게시물을 모두 삭제할까요? 되돌릴 수 없습니다.")) return;
    run(fetch(`/api/admin/demo${id ? `?id=${id}` : "?all=1"}`, { method: "DELETE" }), id ? "삭제했습니다." : "임시 게시물을 모두 삭제했습니다.");
  };

  if (!d) return <p className="text-sub">{msg || "불러오는 중…"}</p>;
  const shownCount = d.posts.filter((p) => p.demo_shown).length;

  return (
    <section data-block-id="A204" data-block-name="임시 게시물" className="space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink">
          임시 게시물 <span className="num text-sub">{d.posts.length} / {d.max}개 · 노출 {shownCount}개</span>
        </p>
        <p className="text-[13px] text-sub">임시 게시물은 실제 회원 이름으로 보이지만, 신청할 수 없고 푸시도 보내지 않습니다.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="만들 개수" value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-xl border border-line bg-white px-3 py-2 text-[15px]">
          {[5, 10, 20, 30].map((n) => <option key={n} value={n}>{n}개</option>)}
        </select>
        <button type="button" data-block-id="B230" data-block-name="임시 게시물 만들기" disabled={busy || d.posts.length + count > d.max} onClick={create} className="min-h-0 rounded-xl bg-accent px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-40">
          임시 게시물 만들기
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <button type="button" data-block-id="B231" data-block-name="전체 노출" disabled={busy || !d.posts.length} onClick={() => setShown(null, true)} className="min-h-0 rounded-xl bg-bg px-4 py-2 text-[15px] text-ink disabled:opacity-40">전체 노출</button>
        <button type="button" data-block-id="B232" data-block-name="전체 숨김" disabled={busy || !d.posts.length} onClick={() => setShown(null, false)} className="min-h-0 rounded-xl bg-bg px-4 py-2 text-[15px] text-ink disabled:opacity-40">전체 숨김</button>
        <button type="button" data-block-id="B233" data-block-name="전체 삭제" disabled={busy || !d.posts.length} onClick={() => remove(null)} className="min-h-0 rounded-xl px-4 py-2 text-[15px] text-warn disabled:opacity-40">전체 삭제</button>
      </div>

      {msg && <p role="status" className="text-[14px] text-sub">{msg}</p>}

      {d.posts.length === 0 ? (
        <p className="rounded-xl bg-bg px-4 py-6 text-center text-[14px] text-sub">아직 임시 게시물이 없습니다. 위에서 개수를 골라 만들어 보세요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {d.posts.map((p) => (
            <li key={p.id} data-block-id="C230" data-block-name="임시 게시물 행" className="flex items-center justify-between gap-3 py-3 text-[14px]">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-semibold text-ink">{p.origin} → {p.dest}</p>
                <p className="flex flex-wrap gap-x-2 text-[12px] text-sub">
                  <span>{p.name}</span>
                  <span>{p.role === "driver" ? "운전자" : "탑승자"}</span>
                  <span>{p.kind === "commute" ? "출퇴근" : "나들이"}</span>
                  {p.regular && <span>정기 {[...p.days].map((c) => DAYS[Number(c)]).join("")} {p.time_go}</span>}
                  {!p.regular && <span>{when(p.depart_at)}</span>}
                  <span>{COST[p.cost] ?? p.cost}{p.cost === "fixed" ? ` ${p.price.toLocaleString("ko-KR")}원` : ""}</span>
                  {p.taxi_share && <span>택시 동승</span>}
                  <span>{p.status === "progress" ? "진행 중" : "모집 중"}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" data-block-id="B234" data-block-name="임시 게시물 노출 전환" aria-pressed={p.demo_shown} disabled={busy} onClick={() => setShown(p.id, !p.demo_shown)}
                  className={`min-h-0 rounded-lg px-3 py-1.5 text-[13px] ${p.demo_shown ? "bg-accentSoft font-semibold text-accent" : "bg-bg text-sub"}`}>
                  {p.demo_shown ? "노출 중" : "숨김"}
                </button>
                <button type="button" data-block-id="B235" data-block-name="임시 게시물 삭제" disabled={busy} onClick={() => remove(p.id)} className="min-h-0 rounded-lg px-3 py-1.5 text-[13px] text-warn">삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
