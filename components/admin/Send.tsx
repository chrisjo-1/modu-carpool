"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Segment = { key: string; label: string };
type Template = { key: string; label: string; category: string; subject: string; body: string };
type Campaign = { id: string; created_at: number; title: string; category: string; segment: string; only_consent: boolean; only_driver: boolean; subject: string; status: string; started_at: number | null; finished_at: number | null; sent: number; failed: number };
type Hist = { created_at: number; to_email: string; subject: string; status: string; kind: string; campaign_id: string | null };
type Saved = { id: string; name: string; category: string; subject: string; body: string };
type Data = { history: Hist[]; policy: { marketingOn: boolean; requireConsent: boolean; dailyCap: number }; segments: Segment[]; templates: Template[]; campaigns: Campaign[] };

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
  // 테스트 받는 주소: 최대 5개 저장(관리자 공용), 체크한 주소로만 보낸다.
  const [testList, setTestList] = useState<string[]>([]);
  const [testPick, setTestPick] = useState<string[]>([]);
  const [testNew, setTestNew] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedId, setSavedId] = useState("");
  const [saveName, setSaveName] = useState("");
  const [uploading, setUploading] = useState(false);

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
    const r = await fetch("/api/admin/campaigns/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testPick, subject, body: bodyText, category }) });
    setBusy(false);
    const j = await r.json();
    const fails = ((j.results ?? []) as { to: string; status: string }[]).filter((x) => x.status !== "sent" && x.status !== "dryrun");
    setMsg(!r.ok ? j.error ?? "테스트 발송에 실패했습니다." : `테스트 메일을 ${j.sent}곳에 보냈습니다. 받은편지함을 확인해 주세요.${fails.length ? ` (보내지 못함: ${fails.map((x) => `${x.to} ${x.status}`).join(", ")})` : ""}`);
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

  const loadSaved = useCallback(async () => {
    const r = await fetch("/api/admin/mail-templates");
    if (r.ok) setSaved((await r.json()).templates ?? []);
  }, []);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  const applySaved = (id: string) => {
    setSavedId(id);
    const t = saved.find((x) => x.id === id);
    if (!t) return;
    setCategory(t.category as "transactional" | "marketing");
    setTemplateKey("custom");
    setSubject(t.subject);
    setBodyText(t.body);
    if (!title) setTitle(t.name);
    setMsg(`"${t.name}" 작성본을 불러왔어요. 고쳐서 발송할 수 있어요.`);
  };

  const saveWork = async () => {
    const name = saveName.trim() || title.trim();
    if (!name) return setMsg("저장할 이름을 적어 주세요.");
    setBusy(true);
    const r = await fetch("/api/admin/mail-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: savedId || undefined, name, category, subject, body: bodyText }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setSavedId(j.id);
    setSaveName("");
    setMsg(`"${name}" 작성본으로 저장했어요.`);
    loadSaved();
  };

  const deleteSaved = async () => {
    const t = saved.find((x) => x.id === savedId);
    if (!t || !window.confirm(`"${t.name}" 작성본을 삭제할까요? 이미 보낸 메일에는 영향이 없어요.`)) return;
    await fetch(`/api/admin/mail-templates?id=${t.id}`, { method: "DELETE" });
    setSavedId("");
    setMsg("작성본을 삭제했어요.");
    loadSaved();
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

        <div className="grid gap-2 rounded-xl bg-bg p-4 text-[14px]">
          <span className="font-semibold">저장한 작성본</span>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${input} sm:max-w-xs`} value={savedId} onChange={(e) => applySaved(e.target.value)} aria-label="저장한 작성본 고르기">
              <option value="">{saved.length ? "작성본을 골라 불러오기" : "저장한 작성본이 없어요"}</option>
              {saved.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.category === "marketing" ? "광고성" : "안내"})</option>)}
            </select>
            <button type="button" className={btn} disabled={!savedId} onClick={deleteSaved}>삭제</button>
          </div>
        </div>

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
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[14px]">
            <span className="font-semibold">이미지 넣기 (사진은 자동으로 줄여서 올려요)</span>
            <input type="file" accept="image/*" disabled={uploading} onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ""; }} className="text-[14px]" />
          </label>
          {uploading && <span className="text-[14px] text-sub">올리는 중…</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-bg p-4">
          <label className="grid flex-1 gap-1 text-[14px]">
            <span className="font-semibold">작성본 이름 (다음에 불러올 때 쓰는 이름)</span>
            <input className={input} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="비우면 캠페인 이름을 씁니다" maxLength={80} />
          </label>
          <button type="button" className={btn} disabled={busy || !subject || !bodyText} onClick={saveWork}>{savedId ? "불러온 작성본에 덮어쓰기" : "작성본으로 저장"}</button>
        </div>

        <div className="grid gap-2 rounded-xl bg-bg p-4 text-[14px]">
          <span className="font-semibold">미리보기 (텍스트)</span>
          <div className="whitespace-pre-wrap leading-relaxed">{bodyText ? bodyText.replace(/\{\{img:[0-9a-f-]{36}\}\}/g, "[이미지]") : "본문을 입력하면 여기 보입니다."}</div>
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
          <button className={btn} disabled={busy} onClick={doCount}>대상자 수 확인</button>
          {count !== null && <span className="text-[14px]"><b>{segLabel}</b> 대상 <b>{count.toLocaleString()}명</b>{d && count > d.policy.dailyCap && isMarketing ? ` · 광고성 하루 한도 ${d.policy.dailyCap}건이라 나눠서 발송됩니다` : ""}</span>}
        </div>

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
      <section className="grid gap-3">
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
