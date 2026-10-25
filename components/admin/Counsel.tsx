"use client";
import { useEffect, useState } from "react";
import { LEVEL_LABEL, METHOD_LABEL, STATUS_LABEL, TOPIC_LABEL, slotLabel, type CounselConfig, type CounselStatus, type Level, type Method, type Topic } from "@/lib/counsel";

type Item = {
  id: string; topic: Topic; mind_index: number; level: Level; crisis: boolean; slot_at: number; method: Method; contact: string; note: string; hard: string; thoughts: string;
  status: CounselStatus; admin_memo: string; created_at: number; email: string; member_code: string;
};
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";
const FILTERS: [string, string][] = [["", "전체"], ["pending", "접수됨"], ["confirmed", "확정"], ["done", "완료"], ["canceled", "취소"]];

/**
 * 관리자 '상담' 탭: 상담 가능 시간(요일별 시각·며칠 앞까지·쉬는 날)과 예약 목록(확정·완료·취소·메모).
 * 앱 접속 팝업 링크에 /?counsel=1 을 넣으면 앱에서 상담 창이 열린다. 새 예약은 ADMIN_EMAILS로 메일이 간다.
 */
export default function AdminCounsel() {
  const [config, setConfig] = useState<CounselConfig | null>(null);
  const [times, setTimes] = useState<string[]>(Array(7).fill(""));
  const [closed, setClosed] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [memo, setMemo] = useState<Record<string, string>>({});

  const load = (f = filter) =>
    fetch(`/api/admin/counsel${f ? `?status=${f}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.config) return setMsg(j.error ?? "불러오지 못했습니다.");
        setConfig(j.config);
        setTimes(DAYS.map((_, d) => (j.config.weekly[String(d)] ?? []).join(", ")));
        setClosed(j.config.closed.join(", "));
        setItems(j.items);
        setCounts(j.counts);
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!config) return;
    const weekly: Record<string, string[]> = {};
    times.forEach((v, d) => {
      const list = v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).map((x) => (/^\d:\d\d$/.test(x) ? `0${x}` : x));
      if (list.length) weekly[String(d)] = list;
    });
    const body = { config: { ...config, weekly, closed: closed.split(/[,\s]+/).filter(Boolean) } };
    const r = await fetch("/api/admin/counsel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setMsg("상담 시간을 저장했어요. (형식이 틀린 시각·날짜는 빠져요)");
    load();
  };

  const patch = async (id: string, data: { status?: CounselStatus; memo?: string }) => {
    const r = await fetch("/api/admin/counsel", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "바꿨어요." : (j.error ?? "바꾸지 못했습니다."));
    load();
  };

  return (
    <div className="space-y-4">
      <section data-block-id="A240" data-block-name="상담 시간 설정" className="max-w-2xl space-y-3 rounded-2xl bg-white p-5 shadow-card">
        <div>
          <p className="text-[15px] font-semibold">마음 상담 · 상담 가능 시간</p>
          <p className="mt-1 text-[13px] leading-relaxed text-sub">
            요일마다 상담 시작 시각을 쉼표로 적어 주세요(예: 19:00, 20:00). 비우면 그 요일은 예약을 받지 않아요. 한 시각에 여러 명이 예약할 수 있어요. 회원에게는 "정성스럽게 상담해 드리고, 상담 내용은 기록으로 남기지 않아요"라고 안내하니 상담 내용은 메모에 적지 말아 주세요.
            앱 접속 팝업의 링크에 <b>/?counsel=1</b> 을 넣으면 팝업을 눌렀을 때 상담 창이 열려요. 새 예약은 관리자 메일(ADMIN_EMAILS)로 알려요.
          </p>
        </div>
        {config && (
          <>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={config.on} onChange={(e) => setConfig({ ...config, on: e.target.checked })} />
              예약 받기
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <span className="w-6 shrink-0 font-semibold">{d}</span>
                  <input className={input} value={times[i]} placeholder="쉬는 날" onChange={(e) => setTimes(times.map((v, k) => (k === i ? e.target.value : v)))} />
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm text-sub">며칠 뒤까지 예약 받기
                <input type="number" min={1} max={60} className={`${input} mt-1`} value={config.days} onChange={(e) => setConfig({ ...config, days: Number(e.target.value) })} />
              </label>
              <label className="text-sm text-sub">최소 몇 시간 전까지 예약
                <input type="number" min={0} max={72} className={`${input} mt-1`} value={config.leadHours} onChange={(e) => setConfig({ ...config, leadHours: Number(e.target.value) })} />
              </label>
            </div>
            <label className="block text-sm text-sub">쉬는 날짜(쉼표, 예: 2026-11-03, 2026-11-10)
              <input className={`${input} mt-1`} value={closed} onChange={(e) => setClosed(e.target.value)} />
            </label>
            <button type="button" data-block-id="A241" onClick={save} className="rounded-xl bg-accent px-5 py-2.5 text-[15px] font-semibold text-white">상담 시간 저장</button>
          </>
        )}
        {msg && <p role="status" className="text-[14px] text-sub">{msg}</p>}
      </section>

      <section data-block-id="A242" data-block-name="상담 예약 목록" className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[15px] font-semibold">예약 목록</p>
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); load(k); }} className={`rounded-full border px-3 py-1.5 text-[13px] ${filter === k ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line text-sub"}`}>
              {label}{k && counts[k] ? ` ${counts[k]}` : ""}
            </button>
          ))}
        </div>
        {!items.length && <p className="text-[14px] text-sub">예약이 없어요.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((b) => (
            <div key={b.id} className={`space-y-2 rounded-xl border p-4 ${b.crisis && (b.status === "pending" || b.status === "confirmed") ? "border-warn bg-warnSoft" : "border-line"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] font-semibold">{slotLabel(b.slot_at)}</p>
                <span className="rounded-full bg-bg px-2.5 py-1 text-[12px] text-sub">{STATUS_LABEL[b.status]}</span>
              </div>
              {b.crisis && <p className="text-[13px] font-bold text-warn">긴급: 위기 문항에 해당 — 회원 화면엔 안내가 없으니 먼저 빨리 연락해 주세요</p>}
              <dl className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-[13px]">
                <dt className="text-sub">유형</dt><dd>{TOPIC_LABEL[b.topic]}</dd>
                <dt className="text-sub">스트레스 지수</dt><dd>{b.mind_index}점 · {LEVEL_LABEL[b.level]}</dd>
                <dt className="text-sub">연락</dt><dd className="break-all">{METHOD_LABEL[b.method]} · {b.method === "email" ? b.email : b.contact}</dd>
                <dt className="text-sub">회원</dt><dd className="break-all">{b.member_code || "-"} · {b.email}</dd>
                {b.hard && (<><dt className="text-sub">힘든 일·사람</dt><dd className="whitespace-pre-wrap">{b.hard}</dd></>)}
                {b.thoughts && (<><dt className="text-sub">떠오르는 생각</dt><dd className="whitespace-pre-wrap">{b.thoughts}</dd></>)}
                {b.note && (<><dt className="text-sub">남긴 말</dt><dd className="whitespace-pre-wrap">{b.note}</dd></>)}
                <dt className="text-sub">접수</dt><dd>{new Date(b.created_at).toLocaleString("ko-KR")}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                {(["confirmed", "done", "canceled"] as CounselStatus[]).filter((s) => s !== b.status).map((s) => (
                  <button key={s} type="button" onClick={() => patch(b.id, { status: s })} className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px]">{STATUS_LABEL[s]}로</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className={input} placeholder="관리자 메모(연락 여부 등, 상담 내용은 적지 않기)" value={memo[b.id] ?? b.admin_memo} onChange={(e) => setMemo({ ...memo, [b.id]: e.target.value })} />
                <button type="button" onClick={() => patch(b.id, { memo: memo[b.id] ?? b.admin_memo })} className="shrink-0 rounded-lg bg-bg px-3 text-[13px]">저장</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
