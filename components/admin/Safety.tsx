"use client";

import { useEffect, useState } from "react";
import { api, Card, Tag } from "@/components/ui";

type Item = {
  id: string;
  status: string;
  result: string;
  origin: string;
  dest: string;
  timeGo: string;
  rider: { nick: string; code: string; email: string; phone: string };
  driver: { nick: string; code: string; email: string; phone: string };
  startedAt: number | null;
  closedAt: number | null;
  pendingSince: number | null;
  overdue: boolean;
  lastAnswer: string;
  lastAnswerAt: number | null;
  createdAt: number | null;
  requestId: string;
  urgentAt: number | null;
  rideContact: boolean;
  boardedAt: number | null;
  rearSeat: boolean;
  etaAt: number | null;
  lateAt: number | null;
};

const RESULT: Record<string, string> = { ok: "이상 없음", issue: "문제 있음", unreachable: "연락 안 됨" };
const clock = (v: number | null) => (v ? new Date(v).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

/** 관리자 '안심동행' 탭: 진행 중 건(전화번호 포함)과 최근 종료 건. 3분 넘게 답 없는 건을 먼저 표시한다. */
export default function AdminSafety() {
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    const r = await api<{ items: Item[] }>("/api/admin/safety");
    if (!r.ok) return setErr(r.error || "불러오지 못했어요.");
    setErr("");
    setItems(r.data.items ?? []);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolve = async (id: string, result: string) => {
    const r = await api("/api/admin/safety", "POST", { id, result });
    setMsg(r.ok ? `처리 기록: ${RESULT[result]}` : r.error || "처리하지 못했어요.");
    load();
  };

  // 진행 중: 위급 신호 → 무응답 순으로 위에 둔다
  const active = items
    .filter((i) => i.status === "active")
    .sort((a, b) => (b.urgentAt ? 4 : 0) + (b.lateAt ? 2 : 0) + (b.overdue ? 1 : 0) - ((a.urgentAt ? 4 : 0) + (a.lateAt ? 2 : 0) + (a.overdue ? 1 : 0)));
  const recent = items.filter((i) => i.status !== "active");

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-[18px] font-bold">안심동행</h2>
        <p className="mt-1 text-[14px] text-sub">
          운영 시간은 오전 6시~밤 10시예요(그 밖에는 새로 시작할 수 없고, 진행 중인 건은 이어서 진행). 위급 신호 → 도착 지연(예상 도착 시각 10분 지남) → 무응답 순으로 위에 뜨고 메일로도 알려요. 탑승자가 3분 넘게 답하지 않으면 빨간 표시가 뜹니다. 등록된 번호로 직접 연락한 뒤 결과를 눌러 주세요. 처리하면 전화번호는 지워집니다.
          운전자 연락처는 버튼을 눌러야 보이며, 볼 때마다 운영 일지에 기록이 남아요. 전화번호는 운영팀만 보며 회원에게 공개되지 않습니다.
        </p>
        {msg && <p className="mt-2 text-[14px] text-mint">{msg}</p>}
        {err && <p className="mt-2 text-[14px] text-warn">{err}</p>}
      </Card>

      <section className="space-y-2">
        <h3 className="text-[15px] font-bold">진행 중 {active.length}건</h3>
        {active.length === 0 && <p className="text-[14px] text-sub">진행 중인 안심동행이 없어요.</p>}
        {active.map((i) => <Row key={i.id} item={i} onResolve={resolve} />)}
      </section>

      <section className="space-y-2">
        <h3 className="text-[15px] font-bold">최근 3일 종료 {recent.length}건</h3>
        {recent.map((i) => <Row key={i.id} item={i} onResolve={resolve} />)}
      </section>
    </div>
  );
}

function Row({ item: i, onResolve }: { item: Item; onResolve: (id: string, result: string) => void }) {
  const active = i.status === "active";
  const [dphone, setDphone] = useState<string | null>(null);
  const [dmsg, setDmsg] = useState("");

  // 운전자 연락처는 버튼을 눌렀을 때만 가져온다(서버에서 열람 기록을 남김)
  const reveal = async () => {
    const r = await api<{ phone: string }>(`/api/admin/safety/phone?req=${i.requestId}`);
    if (r.ok) setDphone(r.data.phone);
    else setDmsg(r.error || "불러오지 못했어요.");
  };

  return (
    <Card className={i.urgentAt || i.overdue || i.lateAt ? "border-warn" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        {active ? <Tag tone="accent">진행 중</Tag> : <Tag>{RESULT[i.result] ?? "종료"}</Tag>}
        {i.urgentAt && <Tag tone="warn">🚨 위급 신호 {clock(i.urgentAt)}</Tag>}
        {i.overdue && <Tag tone="warn">3분 넘게 답 없음</Tag>}
        {i.lateAt && <Tag tone="warn">도착 지연 · 예상 {clock(i.etaAt)}</Tag>}
        {active && (i.boardedAt ? <Tag>{i.rearSeat ? "뒷자리 탑승 ✓" : "탑승 ✓ (뒷자리 아님)"} {clock(i.boardedAt)}</Tag> : <Tag tone="warn">아직 탑승 확인 전</Tag>)}
        {active && i.etaAt && !i.lateAt && <Tag>도착 예정 {clock(i.etaAt)}</Tag>}
        {i.lastAnswer === "no" && <Tag tone="warn">마지막 답: 아니요</Tag>}
      </div>
      <p className="mt-2 text-[15px] font-semibold">{i.origin} → {i.dest}</p>
      <p className="text-[13px] text-sub">{i.timeGo ? `출근 ${i.timeGo} · ` : ""}시작 {clock(i.startedAt)}{i.closedAt ? ` · 종료 ${clock(i.closedAt)}` : ""}</p>
      <div className="mt-2 grid gap-1 text-[14px] sm:grid-cols-2">
        <p><span className="text-sub">탑승자</span> {i.rider.nick || "-"} <span className="text-sub">{i.rider.code}</span></p>
        <p><span className="text-sub">운전자</span> {i.driver.nick || "-"} <span className="text-sub">{i.driver.code}</span></p>
        <p><span className="text-sub">탑승자 번호</span> {i.rider.phone ? <a href={`tel:${i.rider.phone}`} className="font-semibold underline">{i.rider.phone}</a> : "없음"}</p>
        <p><span className="text-sub">운전자 번호</span> {i.driver.phone ? <a href={`tel:${i.driver.phone}`} className="font-semibold underline">{i.driver.phone}</a> : "없음"}</p>
      </div>
      {i.rideContact && (
        <div className="mt-2 text-[14px]">
          {dphone ? (
            <p><span className="text-sub">운전자 연락처(카풀 등록)</span> <a href={`tel:${dphone}`} className="font-semibold underline">{dphone}</a></p>
          ) : (
            <button type="button" onClick={reveal} className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink">운전자 연락처 보기 (열람 기록 남음)</button>
          )}
          {dmsg && <p className="mt-1 text-[13px] text-warn">{dmsg}</p>}
        </div>
      )}
      {active && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onResolve(i.id, "ok")} className="rounded-xl border border-line bg-white px-2 py-2.5 text-[14px] font-semibold">이상 없음</button>
          <button type="button" onClick={() => onResolve(i.id, "issue")} className="rounded-xl bg-warn px-2 py-2.5 text-[14px] font-semibold text-white">문제 있음</button>
          <button type="button" onClick={() => onResolve(i.id, "unreachable")} className="rounded-xl border border-line bg-white px-2 py-2.5 text-[14px] font-semibold">연락 안 됨</button>
        </div>
      )}
    </Card>
  );
}
