"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Segment = { key: string; label: string };
type Campaign = { id: string; created_at: number; title: string; category: string; segment: string; only_consent: boolean; only_driver: boolean; subject: string; body: string | null; status: string; started_at: number | null; finished_at: number | null; sent: number; failed: number; retry: number; auto?: boolean; followup_of?: string | null; followup_mode?: string; opened?: number; clicked?: number; except_ids?: string[] | null };
type Summary = { count: number; pool: number; excludedBySubject: number; excludedByCampaigns: number; groups: Record<string, number> };
type Hist = { created_at: number; to_email: string; subject: string; status: string; kind: string; campaign_id: string | null };
type Run = { id: number; created_at: number; source: string; campaign_title: string; sent: number; held: string | null; done: boolean; ms: number; note: string };
type LogRow = { created_at: number; to_email: string; status: string; error: string; opened: boolean; clicked: boolean };
type LogData = { title: string; totals: { sent: number; failed: number; blocked: number; opened: number; clicked: number }; rows: LogRow[]; more: boolean; next: number | null };
type Data = { history: Hist[]; policy: { marketingOn: boolean; requireConsent: boolean; dailyCap: number }; segments: Segment[]; segmentLabels: Record<string, string>; campaigns: Campaign[]; runs: Run[] };

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const btn = "rounded-lg border border-line bg-white px-3 py-2 text-[14px] font-semibold hover:bg-bg disabled:opacity-50";
const btnPrimary = "rounded-lg bg-accent px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50";
const STATUS: Record<string, string> = { draft: "초안", sending: "발송 중", done: "완료", cancelled: "취소됨" };
const HELD: Record<string, string> = {
  off: "광고성 메일이 정책에서 꺼져 있어 멈췄습니다. 메일 탭에서 허용하세요.",
  quiet: "야간 발송 제한 시간(21시~8시)이라 멈췄습니다. 낮에 이어서 시작할 수 있어요.",
  cap: "오늘 대량 발송 한도(메일 설정의 하루 한도)에 도달해 멈췄습니다. 내일 이어서 보내거나 '매일 자동 이어 보내기'를 켜 두세요.",
  quota: "메일 발송 서비스(Resend)의 하루 한도에 걸려 멈췄습니다. 한도가 풀린 뒤(매일 오전 9시) 또는 요금제를 올린 뒤 다시 누르면 남은 분에게 이어서 보내요.",
};
const when = (t: number | null) => (t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export default function AdminSend() {
  const [d, setD] = useState<Data | null>(null);
  // 광고성 메일은 쓰지 않는다(구워프 회원 마케팅 동의 0명). 안내 메일만 보낸다.
  const category = "transactional" as const;
  const [segs, setSegs] = useState<string[]>(["members"]);
  const [onlyConsent, setOnlyConsent] = useState(false);
  const [onlyDriver, setOnlyDriver] = useState(false);
  // 다시 보내기: 지난 캠페인을 받았지만 열지 않은(open) / 링크를 누르지 않은(click) 사람만
  const [followOf, setFollowOf] = useState("");
  const [followMode, setFollowMode] = useState<"open" | "click">("open");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  // 제외할 이전 캠페인: 그 캠페인을 받은 적이 있으면 제목과 상관없이 빼요(2026-11-01)
  const [exceptIds, setExceptIds] = useState<string[]>([]);
  // 테스트 받는 주소: 최대 5개 저장(관리자 공용), 체크한 주소로만 보낸다.
  const [testList, setTestList] = useState<string[]>([]);
  const [testPick, setTestPick] = useState<string[]>([]);
  const [testNew, setTestNew] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef(false);
  // 지금 고치는 초안(없으면 새 글). 저장하면 이 초안이 갱신된다.
  const [draftId, setDraftId] = useState("");
  const [uploading, setUploading] = useState(false);
  // 캠페인별 받은 사람 기록(열어 본 캠페인 하나)
  const [logId, setLogId] = useState<string | null>(null);
  const [logData, setLogData] = useState<LogData | null>(null);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [logStatus, setLogStatus] = useState("");
  const [logQ, setLogQ] = useState("");
  const [logBusy, setLogBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/campaigns");
    if (!r.ok) return setMsg((await r.json().catch(() => ({}))).error ?? "불러오지 못했습니다.");
    setD(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/admin/campaigns/test").then((r) => r.json()).then((j) => {
      const list: string[] = Array.isArray(j.recipients) ? j.recipients : [];
      setTestList(list);
      setTestPick(list);
    }).catch(() => {});
  }, []);
  const saveTestList = async (list: string[]) => {
    const r = await fetch("/api/admin/campaigns/test", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipients: list }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "주소를 저장하지 못했습니다.");
    setTestList(j.recipients);
    setTestPick((p) => p.filter((x) => j.recipients.includes(x)));
  };
  const addTest = async () => {
    const v = testNew.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setMsg("이메일 형식을 확인해 주세요.");
    if (testList.includes(v)) return setMsg("이미 저장된 주소예요.");
    if (testList.length >= 5) return setMsg("테스트 주소는 5개까지 저장할 수 있어요. 하나를 지운 뒤 추가해 주세요.");
    await saveTestList([...testList, v]);
    setTestPick((p) => [...p, v]);
    setTestNew("");
  };


  const form = () => ({ segments: segs, onlyConsent, onlyDriver, title, subject, body: bodyText, category, followUpOf: followOf || null, followUpMode: followOf ? followMode : "", exceptCampaigns: exceptIds });
  /** 저장된 대상(쉼표로 이어 쓴 키)을 사람이 읽는 이름으로 */
  const labelOf = (seg: string) => seg.split(",").filter(Boolean).map((k) => d?.segmentLabels?.[k] ?? k).join(" + ");
  const segLabel = labelOf(segs.join(","));

  const doCount = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "count", ...form() }) });
    setBusy(false);
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "대상을 계산하지 못했습니다.");
    setCount(j.count);
    setSummary(j as Summary);
  };

  // 발송 중인데 남은 대상이 없으면 완료로 바꾼다(남은 대상이 있으면 그대로 둔다)
  // 자동 이어 보내기(안전장치판): 상태·반송률 보기, 멈춤 풀기, 캠페인별 켜기/끄기
  const [autoInfo, setAutoInfo] = useState<{ paused: boolean; reason: string; backfill: { done: boolean; found: number }; bounce: { sent: number; bounced: number; rate: number | null } } | null>(null);
  const loadAuto = useCallback(async () => {
    const r = await fetch("/api/admin/mail/auto");
    if (r.ok) setAutoInfo(await r.json());
  }, []);
  useEffect(() => { loadAuto(); }, [loadAuto]);
  const resumeAuto = async () => {
    await fetch("/api/admin/mail/auto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume" }) });
    loadAuto();
  };
  const toggleAuto = async (c: Campaign) => {
    const r = await fetch(`/api/admin/campaigns/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto: !c.auto }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "바꾸지 못했습니다.");
    setMsg(!c.auto ? `"${c.title}" 자동 이어 보내기를 켰어요. 오전 9시~오후 8시에 하루 몫 안에서 10분마다 이어서 보내요.` : `"${c.title}" 자동 이어 보내기를 껐어요.`);
    load();
  };

  const settle = async (c: Campaign) => {
    const r = await fetch(`/api/admin/campaigns/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settle: true }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "정리하지 못했습니다.");
    setMsg(j.done ? `"${c.title}"을(를) 완료로 정리했어요.` : `"${c.title}"에는 아직 나가지 않은 대상 ${j.left}명이 남아 있어요. 이어서 보내거나 취소해 주세요.`);
    load();
  };

  // 받은 사람 기록: 처음 불러오기(status·q 적용) 또는 '더 보기'(before 커서로 이어 붙이기)
  const loadLog = async (id: string, status: string, q: string, before?: number) => {
    setLogBusy(true);
    const p = new URLSearchParams({ status, q, limit: "100" });
    if (before) p.set("before", String(before));
    const r = await fetch(`/api/admin/campaigns/${id}/log?${p}`);
    const j = await r.json().catch(() => ({}));
    setLogBusy(false);
    if (!r.ok) return setMsg(j.error ?? "받은 사람 기록을 불러오지 못했습니다.");
    const data = j as LogData;
    setLogData(data);
    setLogRows((prev) => (before ? [...prev, ...data.rows] : data.rows));
  };
  const openLog = (c: Campaign) => {
    setLogId(c.id); setLogStatus(""); setLogQ(""); setLogRows([]); setLogData(null);
    loadLog(c.id, "", "");
  };
  const closeLog = () => { setLogId(null); setLogData(null); setLogRows([]); };

  const sendTest = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/campaigns/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testPick, subject, body: bodyText, category }) });
    setBusy(false);
    const j = await r.json();
    const fails = ((j.results ?? []) as { to: string; status: string }[]).filter((x) => x.status !== "sent" && x.status !== "dryrun");
    setMsg(!r.ok ? j.error ?? "테스트 발송에 실패했습니다." : `테스트 메일을 ${j.sent}곳에 보냈습니다. 받은편지함을 확인해 주세요.${fails.length ? ` (보내지 못함: ${fails.map((x) => `${x.to} ${x.status}`).join(", ")})` : ""}`);
  };

  const saveDraft = async () => {
    setBusy(true); setMsg("");
    const r = await fetch(draftId ? `/api/admin/campaigns/${draftId}` : "/api/admin/campaigns", {
      method: draftId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form()),
    });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setDraftId(draftId || j.id);
    setMsg(draftId ? "초안을 저장했습니다." : "초안으로 저장했습니다. 아래 발송 목록에서 [발송]을 누르면 나갑니다.");
    load();
  };

  const sendNow = async () => {
    setBusy(true); setMsg("");
    const r = await fetch(draftId ? `/api/admin/campaigns/${draftId}` : "/api/admin/campaigns", {
      method: draftId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form()),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); return setMsg(j.error ?? "저장하지 못했습니다."); }
    const id: string = draftId || j.id;
    const list = await (await fetch("/api/admin/campaigns")).json();
    setD(list);
    setBusy(false);
    const c = (list.campaigns as Campaign[]).find((x) => x.id === id);
    if (!c) return setMsg("초안을 찾지 못했어요. 발송 목록에서 직접 [발송]을 눌러 주세요.");
    setDraftId(id);
    await start(c);
  };

  const editDraft = (c: Campaign) => {
    setDraftId(c.id);
    setTitle(c.title);
        setSegs(c.segment.split(",").filter(Boolean));
    setOnlyConsent(c.only_consent);
    setOnlyDriver(c.only_driver);
    setFollowOf(c.followup_of ?? "");
    setFollowMode(c.followup_mode === "click" ? "click" : "open");
    setSubject(c.subject);
    setBodyText(c.body ?? "");
    
    setCount(null);
    setSummary(null);
    setExceptIds(c.except_ids ?? []);
    setMsg(`"${c.title}" 초안을 불러왔어요. 고친 뒤 [저장]을 누르면 이 초안이 바뀝니다.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const newDraft = () => {
    setDraftId("");
    setTitle(""); setSubject(""); setBodyText("");  setCount(null); setSummary(null); setFollowOf(""); setExceptIds([]);
    setMsg("새 글을 시작합니다.");
  };

  const start = async (c: Campaign) => {
    const retry = c.status === "done";
    if (retry ? !window.confirm(`"${c.title}" 캠페인에서 발송 한도로 실패한 ${c.retry}명에게 다시 보낼까요?\n이미 받은 분에게는 다시 가지 않아요.`) : !window.confirm(`"${c.title}" 캠페인을 발송할까요?\n\n대상: ${labelOf(c.segment)}${c.only_consent ? " · 동의 회원만" : ""}${c.only_driver ? " · 운전자만" : ""}\n제목: ${c.subject}\n\n한 번 시작하면 대상자 전체에게 나갑니다. 테스트 발송으로 먼저 확인하셨나요?`)) return;
    stopRef.current = false;
    setRunning(c.id); setProgress(0); setMsg("");
    let total = 0;
    for (let i = 0; i < 2000 && !stopRef.current; i++) {
      const r = await fetch(`/api/admin/campaigns/${c.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 300 }) });
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

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setMsg("");
    // 휴대폰 사진은 대부분 1MB가 넘거나 HEIC라 거절되므로, 올리기 전에 가로 1200px JPEG로 줄인다(GIF는 움직임 유지를 위해 그대로).
    let up: Blob = file;
    if (file.type !== "image/gif") {
      try {
        up = await shrinkImage(file);
      } catch {
        setUploading(false);
        return setMsg("이 사진을 읽지 못했어요. 다른 사진이나 png·jpg로 다시 시도해 주세요.");
      }
    }
    const fd = new FormData();
    fd.append("file", up, file.type === "image/gif" ? file.name : "image.jpg");
    const r = await fetch("/api/admin/mail-images", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setUploading(false);
    if (!r.ok) return setMsg(j.error ?? "이미지를 올리지 못했습니다.");
    setBodyText((b) => (b ? `${b}\n\n${j.token}` : j.token));
    setMsg("이미지를 본문 끝에 넣었어요. 위치는 {{img}} 줄을 옮겨서 바꿀 수 있어요.");
  };


  const cancel = async (c: Campaign) => {
    if (!window.confirm(`"${c.title}" 캠페인을 취소할까요? 아직 나가지 않은 대상만 멈춥니다.`)) return;
    await fetch(`/api/admin/campaigns/${c.id}`, { method: "PATCH" });
    load();
  };

  return (
    <div className="grid gap-6">
      {msg && <div className="rounded-lg border border-line bg-white px-4 py-3 text-[14px]" role="status">{msg}</div>}

      <section className="grid gap-4 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-[18px] font-bold">{draftId ? "초안 고치기" : "새 발송 만들기"}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[14px]">
            <span className="font-semibold">보내는 대상</span>
            <div className="grid gap-1.5 rounded-xl border border-line bg-bg p-3">
              {d?.segments.map((s) => (
                <label key={s.key} className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={segs.includes(s.key)} onChange={(e) => { setSegs((p) => (e.target.checked ? [...p, s.key] : p.filter((x) => x !== s.key))); setCount(null); setSummary(null); }} />
                  {s.label}
                </label>
              ))}
              <span className="text-[12px] text-sub">여러 개 고를 수 있어요. 같은 사람은 한 번만 보내요.</span>
            </div>
          </label>
          <div className="grid content-end gap-2 text-[14px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyDriver} onChange={(e) => setOnlyDriver(e.target.checked)} />운전자 등록 회원만 (차량 등록)</label>
          </div>
        </div>

        <div data-block-id="F409" data-block-name="다시 보내기 대상" className="grid gap-2 rounded-xl border border-line bg-bg p-3 text-[14px]">
          <span className="font-semibold">다시 보내기 (선택)</span>
          <select className={input} value={followOf} onChange={(e) => { setFollowOf(e.target.value); setCount(null); }}>
            <option value="">처음 보내기 — 위 대상 전체</option>
            {d?.campaigns.filter((c) => c.sent > 0 && c.id !== draftId).map((c) => (
              <option key={c.id} value={c.id}>{c.title} ({when(c.created_at)} · {c.sent}명 받음 · 열람 {c.opened ?? 0})</option>
            ))}
          </select>
          {followOf && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5"><input type="radio" checked={followMode === "open"} onChange={() => { setFollowMode("open"); setCount(null); }} />이 메일을 안 연 사람만</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={followMode === "click"} onChange={() => { setFollowMode("click"); setCount(null); }} />링크를 안 누른 사람만</label>
            </div>
          )}
          <span className="text-[12px] leading-relaxed text-sub">고른 캠페인을 받은 사람 중에서 위 대상 조건에도 맞는 사람에게만 보내요. 열람은 메일 앱이 그림을 막으면 기록되지 않아 '안 연 사람'에 조금 더 들어갈 수 있어요. 2026-10-29 열람 추적을 켜기 전에 보낸 메일은 모두 '안 연 것'으로 보입니다.</span>
        </div>

        <div data-block-id="F440" data-block-name="이미 받은 캠페인 제외" className="grid gap-2 rounded-xl border border-line bg-bg p-3 text-[14px]">
          <span className="font-semibold">이미 받은 캠페인 제외 (선택) <span className="font-normal text-sub">{exceptIds.length ? `${exceptIds.length}개 고름` : ""}</span></span>
          <div className="grid max-h-56 gap-1.5 overflow-y-auto">
            {d?.campaigns.filter((c) => c.sent > 0 && c.id !== draftId).length === 0 && <span className="text-sub">받은 기록이 있는 캠페인이 없어요.</span>}
            {d?.campaigns.filter((c) => c.sent > 0 && c.id !== draftId).map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={exceptIds.includes(c.id)} onChange={(e) => { setExceptIds((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id))); setCount(null); setSummary(null); }} />
                <span>{c.title} <span className="text-sub">({when(c.created_at)} · {c.sent}명 받음 · 제목: {c.subject})</span></span>
              </label>
            ))}
          </div>
          <span className="text-[12px] leading-relaxed text-sub">여기서 고른 캠페인을 한 번이라도 받은 사람은 제목이 달라도 빼요. 내용을 고쳐 다시 보낼 때 이미 받은 사람을 건너뛰려면 고르세요.</span>
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
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[14px]">
            <span className="font-semibold">이미지 넣기 (사진은 자동으로 줄여서 올려요)</span>
            <input type="file" accept="image/*" disabled={uploading} onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ""; }} className="text-[14px]" />
          </label>
          {uploading && <span className="text-[14px] text-sub">올리는 중…</span>}
        </div>
        <div className="grid gap-2 rounded-xl bg-bg p-4 text-[14px]">
          <span className="font-semibold">미리보기 (텍스트)</span>
          <div className="whitespace-pre-wrap leading-relaxed">{bodyText ? bodyText.replace(/\{\{img:(?:[0-9a-f-]{36}|\/mail\/[a-z0-9-]+\.(?:png|jpg))\}\}/g, "[이미지]") : "본문을 입력하면 여기 보입니다."}</div>
          {[...bodyText.matchAll(/\{\{img:([0-9a-f-]{36})\}\}/g)].length > 0 && (
            <div className="flex flex-wrap gap-2">
              {[...bodyText.matchAll(/\{\{img:([0-9a-f-]{36})\}\}/g)].map((m, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={`/api/mail/image/${m[1]}`} alt={`넣은 이미지 ${i + 1}`} className="h-20 w-auto rounded-lg border border-line object-cover" />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={busy || !segs.length} onClick={doCount}>가능 인원 검색</button>
          {count !== null && <span className="text-[14px]"><b>{segLabel}</b> 대상 <b>{count.toLocaleString()}명</b> · 하루 몫(월 한도 기준)만큼 나눠 보냅니다</span>}
        </div>
        {summary && (
          <div data-block-id="C441" data-block-name="대상 설명" className="grid gap-1 rounded-xl border border-line bg-bg p-3 text-[14px] leading-relaxed">
            <span>{d?.segments.filter((s) => segs.includes(s.key)).map((s) => <span key={s.key} className="mr-4 inline-block">{s.label} <b>{(summary.groups[s.key] ?? 0).toLocaleString()}명</b></span>)}</span>
            <span>합계(같은 사람은 한 번만) <b>{summary.count.toLocaleString()}명</b></span>
            <span className="text-sub">조건 전체 {summary.pool.toLocaleString()}명 중 같은 제목을 이미 받아서 뺀 사람 {summary.excludedBySubject.toLocaleString()}명, 고른 캠페인을 받아서 뺀 사람 {summary.excludedByCampaigns.toLocaleString()}명</span>
            {summary.excludedBySubject > 0 && summary.count === 0 && <span className="font-semibold text-warn">같은 제목으로 이미 다 받은 상태예요. 메일 제목을 바꾸거나 위에서 '이미 받은 캠페인 제외'를 쓰세요.</span>}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <div data-block-id="C140" className="grid w-full gap-2 text-[14px]">
            <span className="font-semibold">테스트 받을 이메일 <span className="font-normal text-sub">(5개까지 저장 · 체크한 곳으로 보내요)</span></span>
            {testList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {testList.map((addr) => (
                  <span key={addr} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${testPick.includes(addr) ? "border-accent bg-accentSoft text-accent" : "border-line bg-white text-sub"}`}>
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={testPick.includes(addr)} onChange={(e) => setTestPick((p) => (e.target.checked ? [...p, addr] : p.filter((x) => x !== addr)))} />
                      {addr}
                    </label>
                    <button type="button" aria-label={`${addr} 지우기`} className="min-h-0 px-1 text-sub" onClick={() => { if (window.confirm(`${addr} 주소를 지울까요?`)) saveTestList(testList.filter((x) => x !== addr)); }}>×</button>
                  </span>
                ))}
              </div>
            )}
            {testList.length < 5 && (
              <div className="flex gap-2">
                <input className={`${input} flex-1`} type="email" value={testNew} onChange={(e) => setTestNew(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTest(); } }} placeholder="주소 추가 (예: me@example.com)" />
                <button type="button" className={btn} disabled={!testNew.trim()} onClick={addTest}>추가</button>
              </div>
            )}
          </div>
          <button className={btn} disabled={busy || !testPick.length || !subject || !bodyText} onClick={sendTest}>테스트 발송{testPick.length ? ` (${testPick.length}곳)` : ""}</button>
          {draftId && <button className={btn} disabled={busy} onClick={newDraft}>새 글로 쓰기</button>}
          <button className={btn} disabled={busy || !title || !subject || !bodyText || !segs.length} onClick={saveDraft}>{draftId ? "저장 (초안 고치기)" : "저장"}</button>
          <button className={btnPrimary} disabled={busy || !!running || !title || !subject || !bodyText || !segs.length} onClick={sendNow}>바로 발송</button>
        </div>
        <p className="text-[13px] text-sub">저장하면 발송 목록에 초안으로 남아요. 목록의 [발송]을 눌러야 나갑니다. 나가기 전까지 여러 번 고칠 수 있어요.</p>
      </section>

      <section className="grid gap-3">
        {autoInfo && (
          <div data-block-id="C450" data-block-name="자동 이어 보내기 상태" className={`rounded-2xl border p-4 text-sm ${autoInfo.paused ? "border-warn bg-warnSoft" : "border-line bg-white"}`}>
            <p className="font-semibold">자동 이어 보내기 (안전장치) {autoInfo.paused ? "· 멈춤" : "· 켜짐"}</p>
            <p className="mt-1 text-sub">'자동'을 켠 발송 중 캠페인만 오전 9시~오후 8시에 하루 몫 안에서 10분마다 이어서 보내요. 최근 3일 반송률이 2%를 넘으면 스스로 멈추고 관리자에게 메일을 보내요.</p>
            <p className="mt-1">최근 3일 반송률: {autoInfo.bounce.rate === null ? `판단 전(보낸 ${autoInfo.bounce.sent}통, 300통부터 판단)` : `${(autoInfo.bounce.rate * 100).toFixed(1)}% (보낸 ${autoInfo.bounce.sent}통 중 반송 ${autoInfo.bounce.bounced}통)`}</p>
            <p className="mt-0.5 text-sub">반송 주소 정리: {autoInfo.backfill.done ? `끝남 (반송 ${autoInfo.backfill.found}건을 제외 목록에 넣음)` : `진행 중 (지금까지 ${autoInfo.backfill.found}건)`}</p>
            {autoInfo.paused && (
              <>
                <p className="mt-2 font-semibold text-warn">{autoInfo.reason}</p>
                <button data-block-id="B470" data-block-name="자동 발송 다시 켜기" className={`${btn} mt-2`} onClick={resumeAuto}>자동 발송 다시 켜기</button>
              </>
            )}
          </div>
        )}
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
              <tr><th className="p-3">만든 날</th><th className="p-3">캠페인</th><th className="p-3">종류</th><th className="p-3">대상</th><th className="p-3">상태</th><th className="p-3">발송/실패</th><th className="p-3">열람·클릭</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {d?.campaigns.length === 0 && <tr><td className="p-4 text-sub" colSpan={8}>아직 만든 캠페인이 없습니다.</td></tr>}
              {d?.campaigns.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="p-3 whitespace-nowrap">{when(c.created_at)}</td>
                  <td className="p-3"><b>{c.title}</b><span className="block text-xs text-sub">{c.subject}</span></td>
                  <td className="p-3">{c.category === "marketing" ? "광고성" : "안내"}</td>
                  <td className="p-3">{labelOf(c.segment)}{c.only_consent ? " · 동의" : ""}{c.only_driver ? " · 운전자" : ""}{c.followup_of ? <span className="block text-xs text-sub">다시 보내기 · {c.followup_mode === "click" ? "링크 안 누른 사람" : "안 연 사람"}{d.campaigns.find((x) => x.id === c.followup_of) ? ` (${d.campaigns.find((x) => x.id === c.followup_of)?.title})` : ""}</span> : null}</td>
                  <td className="p-3">{STATUS[c.status] ?? c.status}{c.finished_at ? <span className="block text-xs text-sub">{when(c.finished_at)}</span> : null}</td>
                  <td className="p-3">{c.sent} / {c.failed}{c.retry > 0 ? <span className="block text-xs text-sub">한도 초과 {c.retry}명 · 다시 보낼 수 있음</span> : null}</td>
                  <td className="p-3 whitespace-nowrap">{c.sent > 0 ? <>열람 {c.opened ?? 0} <span className="text-xs text-sub">({Math.round(((c.opened ?? 0) / c.sent) * 100)}%)</span><span className="block">클릭 {c.clicked ?? 0} <span className="text-xs text-sub">({Math.round(((c.clicked ?? 0) / c.sent) * 100)}%)</span></span></> : "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button className={`${btn} mb-2`} onClick={() => openLog(c)}>받은 사람 보기</button>
                    {c.status === "sending" && !running && (
                      <button className={`${btn} mb-2`} onClick={() => settle(c)}>완료로 정리</button>
                    )}
                    {c.status === "sending" && (
                      <button data-block-id="B471" data-block-name="자동 이어 보내기 켜기" className={`${c.auto ? btnPrimary : btn} mb-2`} onClick={() => toggleAuto(c)}>{c.auto ? "자동 이어 보내기 켜짐 (끄기)" : "자동 이어 보내기 켜기"}</button>
                    )}
                    {c.status === "done" && c.retry > 0 && (
                      <button className={btnPrimary} disabled={!!running} onClick={() => start(c)}>실패분 다시 보내기 ({c.retry}명)</button>
                    )}
                    {(c.status === "draft" || c.status === "sending") && (
                      <div className="flex flex-wrap gap-2">
                        {c.status === "draft" && <button className={btn} disabled={!!running} onClick={() => editDraft(c)}>불러와서 고치기</button>}
                        <button className={btnPrimary} disabled={!!running} onClick={() => start(c)}>{c.status === "draft" ? "발송" : "이어서 발송"}</button>
                        <button className={btn} disabled={!!running} onClick={() => cancel(c)}>취소</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logId && (
          <div data-block-id="C443" data-block-name="캠페인 받은 사람" className="grid gap-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[16px] font-bold">받은 사람 · {logData?.title ?? "불러오는 중"}</h3>
              <button className={btn} onClick={closeLog}>닫기</button>
            </div>
            {logData && (
              <p className="text-[14px] text-sub">
                보냄 {logData.totals.sent.toLocaleString()} · 실패 {logData.totals.failed.toLocaleString()} · 차단 {logData.totals.blocked.toLocaleString()}
                {" · "}열람 {logData.totals.opened.toLocaleString()} · 클릭 {logData.totals.clicked.toLocaleString()}
              </p>
            )}
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (logId) loadLog(logId, logStatus, logQ.trim()); }}>
              <select className={input} style={{ width: "auto" }} value={logStatus} onChange={(e) => { setLogStatus(e.target.value); if (logId) loadLog(logId, e.target.value, logQ.trim()); }}>
                <option value="">전체</option>
                <option value="sent">보냄</option>
                <option value="failed">실패</option>
                <option value="blocked">차단(보내지 않음)</option>
              </select>
              <input className={input} style={{ maxWidth: 260 }} placeholder="이메일 검색" value={logQ} onChange={(e) => setLogQ(e.target.value)} />
              <button type="submit" className={btn} disabled={logBusy}>찾기</button>
            </form>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-bg text-sub">
                  <tr><th className="p-3">시각</th><th className="p-3">받는 사람</th><th className="p-3">결과</th><th className="p-3">열람·클릭</th><th className="p-3">사유</th></tr>
                </thead>
                <tbody>
                  {logRows.length === 0 && !logBusy && <tr><td className="p-4 text-sub" colSpan={5}>조건에 맞는 기록이 없습니다.</td></tr>}
                  {logRows.map((r, i) => (
                    <tr key={`${r.created_at}-${r.to_email}-${i}`} className="border-t border-line">
                      <td className="p-3 whitespace-nowrap">{when(r.created_at)}</td>
                      <td className="p-3">{r.to_email}</td>
                      <td className="p-3">{r.status === "sent" ? "보냄" : r.status === "failed" ? "실패" : r.status === "blocked" ? "차단" : r.status}</td>
                      <td className="p-3 whitespace-nowrap">{r.status === "sent" ? `${r.opened ? "열람" : "안 봄"}${r.clicked ? " · 클릭" : ""}` : "—"}</td>
                      <td className="p-3 text-[13px] text-sub">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logData?.more && (
              <button className={btn} disabled={logBusy} onClick={() => logId && logData.next && loadLog(logId, logStatus, logQ.trim(), logData.next)}>
                {logBusy ? "불러오는 중…" : "더 보기"}
              </button>
            )}
          </div>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-[18px] font-bold">발송 실행 기록 <span className="text-sm font-normal text-sub">[지금 이어서 발송] 실행 내역, 최근 100건</span></h2>
        <div data-block-id="C442" data-block-name="발송 실행 기록" className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-bg text-sub">
              <tr><th className="p-3">실행 시각</th><th className="p-3">캠페인</th><th className="p-3">이번 발송</th><th className="p-3">결과</th><th className="p-3">걸린 시간</th></tr>
            </thead>
            <tbody>
              {d?.runs?.length === 0 && <tr><td className="p-4 text-sub" colSpan={5}>아직 발송 기록이 없습니다.</td></tr>}
              {d?.runs?.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="p-3 whitespace-nowrap">{when(r.created_at)}</td>
                  <td className="p-3">{r.campaign_title || "—"}</td>
                  <td className="p-3">{r.sent.toLocaleString()}명</td>
                  <td className="p-3">{r.done ? "완료" : (r.held ? (HELD[r.held] ?? r.held) : "진행 중")}{r.note ? <span className="block text-xs text-sub">{r.note}</span> : null}</td>
                  <td className="p-3 whitespace-nowrap">{(r.ms / 1000).toFixed(1)}초</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="text-[18px] font-bold">발송 기록 <span className="text-sm font-normal text-sub">최근 200건</span></h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-bg text-sub">
              <tr><th className="p-3">보낸 때</th><th className="p-3">받는 사람</th><th className="p-3">제목</th><th className="p-3">결과</th></tr>
            </thead>
            <tbody>
              {d?.history.length === 0 && <tr><td className="p-4 text-sub" colSpan={4}>아직 보낸 기록이 없습니다.</td></tr>}
              {d?.history.map((h, i) => (
                <tr key={`${h.created_at}-${i}`} className="border-t border-line">
                  <td className="p-3 whitespace-nowrap">{when(h.created_at)}</td>
                  <td className="p-3">{h.to_email}</td>
                  <td className="p-3">{h.subject}</td>
                  <td className="p-3">{h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** 사진을 가로 최대 1200px JPEG로 줄인다(1MB 넘으면 품질을 낮춰 다시). */
async function shrinkImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("decode"));
      el.src = url;
    });
    let w = Math.min(1200, img.naturalWidth || 1200);
    let q = 0.85;
    for (let i = 0; i < 5; i++) {
      const h = Math.round(((img.naturalHeight || w) * w) / (img.naturalWidth || w));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= 950_000) return blob;
      w = Math.round(w * 0.8);
      q = Math.max(0.5, q - 0.1);
    }
    throw new Error("too large");
  } finally {
    URL.revokeObjectURL(url);
  }
}
