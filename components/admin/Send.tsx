"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Segment = { key: string; label: string };
type Template = { key: string; label: string; category: string; subject: string; body: string };
type Campaign = { id: string; created_at: number; title: string; category: string; segment: string; only_consent: boolean; only_driver: boolean; subject: string; status: string; started_at: number | null; finished_at: number | null; sent: number; failed: number };
type Data = { policy: { marketingOn: boolean; requireConsent: boolean; dailyCap: number }; segments: Segment[]; templates: Template[]; campaigns: Campaign[] };

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const btn = "rounded-lg border border-line bg-white px-3 py-2 text-[14px] font-semibold hover:bg-bg disabled:opacity-50";
const btnPrimary = "rounded-lg bg-accent px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50";
const STATUS: Record<string, string> = { draft: "초안", sending: "발송 중", done: "완료", cancelled: "취소됨" };
const HELD: Record<string, string> = {
  off: "광고성 메일이 정책에서 꺼져 있어 멈췄습니다. 메일 탭에서 허용하세요.",
  quiet: "야간 발송 제한 시간(21시~8시)이라 멈췄습니다. 낮에 이어서 시작할 수 있어요.",
  cap: "오늘 광고성 발송 한도에 도달해 멈췄습니다. 내일 이어서 시작할 수 있어요.",
};
const when = (t: number | null) => (t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export default function AdminSend() {
  const [d, setD] = useState<Data | null>(null);
  const [templateKey, setTemplateKey] = useState("custom");
  const [category, setCategory] = useState<"transactional" | "marketing">("transactional");
  const [segment, setSegment] = useState("members");
  const [onlyConsent, setOnlyConsent] = useState(false);
  const [onlyDriver, setOnlyDriver] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/campaigns");
    if (!r.ok) return setMsg((await r.json().catch(() => ({}))).error ?? "불러오지 못했습니다.");
    setD(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  // 광고성 메일은 마케팅 동의 회원에게만 보낸다
  const isMarketing = category === "marketing";
  useEffect(() => { if (isMarketing) setOnlyConsent(true); }, [isMarketing]);

  const pickTemplate = (key: string) => {
    setTemplateKey(key);
    const t = d?.templates.find((x) => x.key === key);
    if (!t || key === "custom") return;
    setCategory(t.category as "transactional" | "marketing");
    setSubject(t.subject);
    setBodyText(t.body);
    if (!title) setTitle(t.label);
  };
  const form = () => ({ segment, onlyConsent, onlyDriver, title, subject, body: bodyText, category });
  const segLabel = d?.segments.find((s) => s.key === segment)?.label ?? "";

  const doCount = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "count", ...form() }) });
    setBusy(false);
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "대상을 계산하지 못했습니다.");
    setCount(j.count);
  };

  const sendTest = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/campaigns/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testTo, subject, body: bodyText, category }) });
    setBusy(false);
    const j = await r.json();
    setMsg(!r.ok ? j.error ?? "테스트 발송에 실패했습니다." : j.ok ? `${testTo}으로 테스트 메일을 보냈습니다. 받은편지함을 확인해 주세요.` : `테스트 발송 결과: ${j.status}`);
  };

  const createDraft = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form()) });
    setBusy(false);
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "초안을 만들지 못했습니다.");
    setMsg("초안을 만들었습니다. 아래 목록에서 검토한 뒤 발송을 시작하세요.");
    load();
  };

  const start = async (c: Campaign) => {
    if (!window.confirm(`"${c.title}" 캠페인을 발송할까요?\n\n대상: ${c.segment}${c.only_consent ? " · 동의 회원만" : ""}${c.only_driver ? " · 운전자만" : ""}\n제목: ${c.subject}\n\n한 번 시작하면 대상자 전체에게 나갑니다. 테스트 발송으로 먼저 확인하셨나요?`)) return;
    stopRef.current = false;
    setRunning(c.id); setProgress(0); setMsg("");
    let total = 0;
    for (let i = 0; i < 2000 && !stopRef.current; i++) {
      const r = await fetch(`/api/admin/campaigns/${c.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 50 }) });
      const j = await r.json();
      if (!r.ok) { setMsg(j.error ?? "발송 중 오류가 났습니다."); break; }
      total += j.sent;
      setProgress(total);
      if (j.held) { setMsg(`${HELD[j.held] ?? "발송이 멈췄습니다."} (지금까지 ${total}건 발송)`); break; }
      if (j.done) { setMsg(`발송을 마쳤습니다. 총 ${total}건.`); break; }
    }
    if (stopRef.current) setMsg(`발송을 멈췄습니다. 지금까지 ${total}건. 나머지는 다시 시작하면 이어서 보내고 중복 발송되지 않아요.`);
    setRunning(null);
    load();
  };

  const cancel = async (c: Campaign) => {
    if (!window.confirm(`"${c.title}" 캠페인을 취소할까요? 아직 나가지 않은 대상만 멈춥니다.`)) return;
    await fetch(`/api/admin/campaigns/${c.id}`, { method: "PATCH" });
    load();
  };

  return (
    <div className="grid gap-6">
      {msg && <div className="rounded-lg border border-line bg-white px-4 py-3 text-[14px]" role="status">{msg}</div>}

      {d && !d.policy.marketingOn && isMarketing && (
        <div className="rounded-lg border border-warn bg-white px-4 py-3 text-[14px] text-warn">광고성 발송이 정책에서 꺼져 있어, 광고성 캠페인은 발송되지 않습니다. 메일 탭 정책에서 허용해 주세요.</div>
      )}

      <section className="grid gap-4 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-[18px] font-bold">새 발송 만들기</h2>

        <label className="grid gap-1 text-[14px]">
          <span className="font-semibold">템플릿</span>
          <select className={input} value={templateKey} onChange={(e) => pickTemplate(e.target.value)}>
            {d?.templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>

        <fieldset className="grid gap-1 text-[14px]">
          <span className="font-semibold">메일 종류</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={category === "transactional"} onChange={() => setCategory("transactional")} />안내 메일 (동의 불필요)</label>
            <label className="flex items-center gap-2"><input type="radio" checked={category === "marketing"} onChange={() => setCategory("marketing")} />광고성 메일 (마케팅 동의 회원만, 제목 앞에 (광고) 자동 표시)</label>
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[14px]">
            <span className="font-semibold">보내는 대상</span>
            <select className={input} value={segment} onChange={(e) => setSegment(e.target.value)}>
              {d?.segments.filter((s) => !(isMarketing && s.key === "legacy_unjoined")).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <div className="grid content-end gap-2 text-[14px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyConsent} disabled={isMarketing} onChange={(e) => setOnlyConsent(e.target.checked)} />마케팅 동의 회원만{isMarketing && " (광고성은 필수)"}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyDriver} onChange={(e) => setOnlyDriver(e.target.checked)} />운전자 등록 회원만 (차량 등록)</label>
          </div>
        </div>

        <label className="grid gap-1 text-[14px]">
          <span className="font-semibold">캠페인 이름 (관리용)</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 6월 구워프 안내 1차" maxLength={80} />
        </label>
        <label className="grid gap-1 text-[14px]">
          <span className="font-semibold">메일 제목</span>
          <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        </label>
        <label className="grid gap-1 text-[14px]">
          <span className="font-semibold">본문 (빈 줄로 문단을 나눠요)</span>
          <textarea className={`${input} min-h-[220px]`} value={bodyText} onChange={(e) => setBodyText(e.target.value)} maxLength={5000} />
        </label>

        <div className="grid gap-2 rounded-xl bg-bg p-4 text-[14px]">
          <span className="font-semibold">미리보기 (텍스트)</span>
          <div className="whitespace-pre-wrap leading-relaxed">{bodyText || "본문을 입력하면 여기 보입니다."}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={busy} onClick={doCount}>대상자 수 확인</button>
          {count !== null && <span className="text-[14px]"><b>{segLabel}</b> 대상 <b>{count.toLocaleString()}명</b>{d && count > d.policy.dailyCap && isMarketing ? ` · 광고성 하루 한도 ${d.policy.dailyCap}건이라 나눠서 발송됩니다` : ""}</span>}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <label className="grid flex-1 gap-1 text-[14px]">
            <span className="font-semibold">테스트 받을 이메일</span>
            <input className={input} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="본인 주소 입력" />
          </label>
          <button className={btn} disabled={busy || !testTo || !subject || !bodyText} onClick={sendTest}>테스트 발송</button>
          <button className={btnPrimary} disabled={busy || !title || !subject || !bodyText} onClick={createDraft}>초안 저장</button>
        </div>
        <p className="text-[13px] text-sub">초안은 바로 나가지 않습니다. 아래 목록에서 한 번 더 확인한 뒤 발송을 시작합니다.</p>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">발송 목록</h2>
          <div className="flex items-center gap-2">
            {running && <button className={btn} onClick={() => { stopRef.current = true; }}>발송 멈추기 ({progress}건)</button>}
            <button className={btn} onClick={load}>새로고침</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-bg text-sub">
              <tr><th className="p-3">만든 날</th><th className="p-3">캠페인</th><th className="p-3">종류</th><th className="p-3">대상</th><th className="p-3">상태</th><th className="p-3">발송/실패</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {d?.campaigns.length === 0 && <tr><td className="p-4 text-sub" colSpan={7}>아직 만든 캠페인이 없습니다.</td></tr>}
              {d?.campaigns.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="p-3 whitespace-nowrap">{when(c.created_at)}</td>
                  <td className="p-3"><b>{c.title}</b><span className="block text-xs text-sub">{c.subject}</span></td>
                  <td className="p-3">{c.category === "marketing" ? "광고성" : "안내"}</td>
                  <td className="p-3">{d.segments.find((s) => s.key === c.segment)?.label ?? c.segment}{c.only_consent ? " · 동의" : ""}{c.only_driver ? " · 운전자" : ""}</td>
                  <td className="p-3">{STATUS[c.status] ?? c.status}{c.finished_at ? <span className="block text-xs text-sub">{when(c.finished_at)}</span> : null}</td>
                  <td className="p-3">{c.sent} / {c.failed}</td>
                  <td className="p-3 whitespace-nowrap">
                    {(c.status === "draft" || c.status === "sending") && (
                      <div className="flex gap-2">
                        <button className={btnPrimary} disabled={!!running} onClick={() => start(c)}>{c.status === "draft" ? "발송 시작" : "이어서 발송"}</button>
                        <button className={btn} disabled={!!running} onClick={() => cancel(c)}>취소</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
