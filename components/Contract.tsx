"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CANCEL_OPTIONS, FIXED_CLAUSES, NOSHOW_OPTIONS, STATUS_LABEL, WAIT_OPTIONS, cleanTerms, defaultTerms, legalWarnings, monthEnd, monthlyEstimate, type ContractTerms } from "@/lib/contract";
import type { Place } from "@/lib/types";
import PlaceField from "./PlaceField";
import { dayLabel } from "@/lib/i18n";
import { Sheet, api, btnGhost, btnPrimary, field, useLang, useT } from "./ui";

type Party = { name: string; code: string; carNo?: string };
type Contract = { id: string; version: number; status: string; proposedBy: string; terms: ContractTerms; driverSignedAt: number | null; riderSignedAt: number | null; endedAt: number | null; createdAt: number };
type Data = { me: string; driverId: string; riderId: string; driver: Party; rider: Party; post: { origin: string; dest: string; days: string; timeGo: string; timeBack: string; price: number; originLat: number | null; originLng: number | null; destLat: number | null; destLng: number | null }; canWrite: boolean; contracts: Contract[] };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }) : "");
const DAY_KEYS = ["1", "2", "3", "4", "5", "6", "0"];
const DAY_NAMES: Record<string, string> = { "0": "일", "1": "월", "2": "화", "3": "수", "4": "목", "5": "금", "6": "토" };

/** 계약서 본문(읽기 전용). 비용을 맨 위에 크게 보여 준다. */
function Doc({ c, d }: { c: Contract; d: Data }) {
  const t = useT();
  const lang = useLang();
  const x = c.terms;
  const backOn = x.backOn ?? !!x.timeBack;
  const est = monthlyEstimate({ costType: x.costType, amount: x.amount, amountBack: x.amountBack ?? 0, backOn, days: x.days });
  const rows: [string, string][] = [
    [t("기간"), `${x.startDate} ~ ${x.endDate}${x.autoRenew ? ` · ${t("자동 연장")}` : ""}`],
    [t("요일"), dayLabel(lang, x.days)],
    [t("출근"), `${x.timeGo} · ${x.pickup} → ${x.dropoff}`],
    ...(backOn ? [[t("퇴근"), `${x.timeBack} · ${x.backPickup || x.dropoff} → ${x.backDropoff || x.pickup}`] as [string, string]] : []),
    [t("기다려 주는 시간"), `${x.waitMin}${t("분")}`],
    [t("정산 방법"), x.settle],
    [t("취소 통보"), x.cancelNotice],
    [t("알리지 않고 불참하면"), x.noShow],
    [t("중도 해지"), `${x.terminateDays}${t("일 전에 알리고, 남은 기간 비용은 날짜 비율로 정산")}`],
  ];
  return (
    <div data-block-id="C415" data-block-name="계약서 본문" className="space-y-3 rounded-2xl border border-line bg-white p-4 text-[14px]">
      <div className="flex items-center justify-between">
        <p className="text-[16px] font-bold text-ink">{t("정기카풀 계약서")} · {c.version}{t("판")}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${c.status === "signed" ? "bg-mintSoft text-mint" : c.status === "proposed" ? "bg-accentSoft text-accent" : "bg-bg text-sub"}`}>{t(STATUS_LABEL[c.status] ?? c.status)}</span>
      </div>
      <p className="text-sub">
        {t("운전자")} <b className="text-ink">{d.driver.name}</b>{d.driver.code ? ` (${d.driver.code})` : ""}{d.driver.carNo ? ` · ${d.driver.carNo}` : ""} · {t("탑승자")} <b className="text-ink">{d.rider.name}</b>{d.rider.code ? ` (${d.rider.code})` : ""}
      </p>
      <div data-block-id="C419" data-block-name="계약 금액" className="rounded-xl bg-accentSoft px-4 py-3">
        <p className="text-[13px] text-accent">💰 {t("카풀 비용")}</p>
        {x.costType === "month" ? (
          <p className="num text-[22px] font-bold text-ink">{t("월")} {won(x.amount)}</p>
        ) : (
          <>
            <p className="num text-[20px] font-bold text-ink">{t("출근 1회")} {won(x.amount)}{backOn ? ` · ${t("퇴근 1회")} ${won(x.amountBack ?? 0)}` : ""}</p>
            <p className="num text-[13px] text-sub">{t("한 달 약")} {won(est)} ({t("주")} {x.days.length}{t("일 기준")})</p>
          </>
        )}
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-line align-top">
              <td className="w-[34%] py-1.5 pr-2 text-sub">{k}</td>
              <td className="py-1.5 text-ink">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {x.extra && (
        <div className="rounded-xl bg-bg px-3 py-2">
          <p className="text-[12px] text-sub">{t("추가 약속")}</p>
          <p className="whitespace-pre-wrap break-words text-ink">{x.extra}</p>
        </div>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-sub">
        {FIXED_CLAUSES.map((f) => (
          <li key={f}>{t(f)}</li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <p className={`rounded-xl px-3 py-2 ${c.driverSignedAt ? "bg-mintSoft text-mint" : "bg-bg text-sub"}`}>{t("운전자 동의")}<br /><b>{c.driverSignedAt ? when(c.driverSignedAt) : t("대기")}</b></p>
        <p className={`rounded-xl px-3 py-2 ${c.riderSignedAt ? "bg-mintSoft text-mint" : "bg-bg text-sub"}`}>{t("탑승자 동의")}<br /><b>{c.riderSignedAt ? when(c.riderSignedAt) : t("대기")}</b></p>
      </div>
      {c.endedAt && <p className="text-[13px] text-warn">{t(c.status === "ended" ? "해지" : "취소")}: {when(c.endedAt)}</p>}
    </div>
  );
}

/** 작성·고쳐 보내기 화면 */
function Form({ requestId, base, onSent, onCancel, toast }: { requestId: string; base: ContractTerms; onSent: () => void; onCancel: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [x, setX] = useState<ContractTerms>(base);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ContractTerms>(k: K, v: ContractTerms[K]) => setX((o) => ({ ...o, [k]: v }));
  const warns = legalWarnings(x);
  const toggleDay = (k: string) => set("days", x.days.includes(k) ? x.days.replace(k, "") : [...x.days, k].sort().join(""));
  const place = (name: string, la: number | null, ln: number | null): Place => ({ name, lat: la, lng: ln });
  const est = monthlyEstimate(x);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanTerms(x);
    if (!c.terms) return toast(t(c.error ?? "입력을 확인해 주세요."));
    if (!c.terms.amount && !c.terms.amountBack && !window.confirm(t("카풀 비용이 0원이에요. 무료로 계약할까요?"))) return;
    if (!window.confirm(t("이 내용으로 계약서를 보낼까요? 보내면 나는 이 내용에 동의한 것으로 기록돼요."))) return;
    setBusy(true);
    const r = await api("/api/contracts", "POST", { action: "propose", requestId, terms: c.terms });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(t("계약서를 보냈어요. 상대가 동의하면 체결돼요."));
    onSent();
  };
  const lbl = "block space-y-1 text-[14px] text-sub";
  const box = "space-y-3 rounded-2xl border border-line bg-white p-4";
  const chip = (on: boolean) => `min-h-0 rounded-full border px-4 py-2 text-[15px] ${on ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`;
  return (
    <form data-block-id="F415" data-block-name="계약서 작성" onSubmit={submit} className="space-y-4">
      <p className="rounded-xl bg-accentSoft px-4 py-3 text-[14px] leading-relaxed text-accent">{t("서로 대화로 정한 내용을 적어 주세요. 보내면 상대가 확인하고 동의해야 체결돼요.")}</p>

      <section data-block-id="C420" data-block-name="계약 금액 입력" className="space-y-3 rounded-2xl border-2 border-accent bg-white p-4">
        <p className="text-[17px] font-bold text-ink">💰 {t("카풀 비용")}</p>
        <div className="flex gap-2">
          <button type="button" aria-pressed={x.costType === "ride"} className={chip(x.costType === "ride")} onClick={() => set("costType", "ride")}>{t("회당")}</button>
          <button type="button" aria-pressed={x.costType === "month"} className={chip(x.costType === "month")} onClick={() => set("costType", "month")}>{t("월 정액")}</button>
        </div>
        {x.costType === "month" ? (
          <label className={lbl}>{t("한 달 금액(원)")}<input type="number" min={0} step={1000} inputMode="numeric" className={`${field} num text-[20px] font-bold`} value={x.amount || ""} placeholder="0" onChange={(e) => set("amount", Number(e.target.value))} /></label>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className={lbl}>{t("출근 1회(원)")}<input type="number" min={0} step={100} inputMode="numeric" className={`${field} num text-[18px] font-bold`} value={x.amount || ""} placeholder="0" onChange={(e) => set("amount", Number(e.target.value))} /></label>
            {x.backOn && <label className={lbl}>{t("퇴근 1회(원)")}<input type="number" min={0} step={100} inputMode="numeric" className={`${field} num text-[18px] font-bold`} value={x.amountBack || ""} placeholder="0" onChange={(e) => set("amountBack", Number(e.target.value))} /></label>}
          </div>
        )}
        {x.costType === "ride" && <p className="num text-[14px] text-ink">{t("한 달 약")} <b>{won(est)}</b> <span className="text-sub">({t("주")} {x.days.length}{t("일 × 4.3주")})</span></p>}
        <p className="text-[12px] text-sub">{t("기름값·통행료 같은 실비를 나누는 금액이에요.")}</p>
        {warns.length > 0 && (
          <div data-block-id="C416" data-block-name="법정 시간 경고" className="space-y-1 rounded-xl bg-warnSoft px-4 py-3 text-[13px] leading-relaxed text-warn">
            {warns.map((w) => <p key={w}>· {t(w)}</p>)}
            <p>{t("이 시간에는 비용 없이 함께 타는 것만 가능해요.")}</p>
          </div>
        )}
      </section>

      <section className={box}>
        <p className="text-[16px] font-semibold text-ink">{t("기간·요일")}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={lbl}>{t("시작일")}<input type="date" className={field} value={x.startDate} onChange={(e) => setX((o) => ({ ...o, startDate: e.target.value, endDate: e.target.value ? monthEnd(e.target.value) : o.endDate }))} required /></label>
          <label className={lbl}>{t("끝나는 날")}<input type="date" className={field} value={x.endDate} min={x.startDate} onChange={(e) => set("endDate", e.target.value)} required /></label>
        </div>
        <label className="flex items-center gap-2 text-[15px] text-ink"><input type="checkbox" checked={x.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} className="h-5 w-5" />{t("끝나면 같은 조건으로 한 달씩 자동 연장")}</label>
        <div className="flex flex-wrap gap-1.5">
          {DAY_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={x.days.includes(k)} onClick={() => toggleDay(k)} className={`min-h-0 w-10 rounded-full border py-2 text-[14px] ${x.days.includes(k) ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>{t(DAY_NAMES[k])}</button>
          ))}
        </div>
      </section>

      <section className={box}>
        <p className="text-[16px] font-semibold text-ink">{t("출근")}</p>
        <label className={lbl}>{t("출근 시각")}<input type="time" className={field} value={x.timeGo} onChange={(e) => set("timeGo", e.target.value)} required /></label>
        <PlaceField blockId="F416" label={t("탑승 지점")} placeholder={t("예: 수원 영통역 2번 출구")} value={place(x.pickup, x.pickupLat, x.pickupLng)} onChange={(p) => setX((o) => ({ ...o, pickup: p.name, pickupLat: p.lat, pickupLng: p.lng }))} locate toast={toast} />
        <PlaceField blockId="F417" label={t("하차 지점")} placeholder={t("예: 강남역 11번 출구")} value={place(x.dropoff, x.dropoffLat, x.dropoffLng)} onChange={(p) => setX((o) => ({ ...o, dropoff: p.name, dropoffLat: p.lat, dropoffLng: p.lng }))} toast={toast} />
      </section>

      <section className={box}>
        <label className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <input type="checkbox" data-block-id="F418" checked={x.backOn} className="h-5 w-5" onChange={(e) => {
            const on = e.target.checked;
            // 처음 켤 때 퇴근 지점은 출근의 반대로 채운다.
            setX((o) => ({ ...o, backOn: on, ...(on && !o.backPickup ? { backPickup: o.dropoff, backPickupLat: o.dropoffLat, backPickupLng: o.dropoffLng, backDropoff: o.pickup, backDropoffLat: o.pickupLat, backDropoffLng: o.pickupLng } : {}), ...(on && !o.timeBack ? { timeBack: "18:30" } : {}) }));
          }} />
          {t("퇴근도 함께 계약")}
        </label>
        {x.backOn && (
          <>
            <label className={lbl}>{t("퇴근 시각")}<input type="time" className={field} value={x.timeBack} onChange={(e) => set("timeBack", e.target.value)} required /></label>
            <PlaceField blockId="F419" label={t("퇴근 탑승 지점")} placeholder={t("예: 강남역 11번 출구")} value={place(x.backPickup, x.backPickupLat, x.backPickupLng)} onChange={(p) => setX((o) => ({ ...o, backPickup: p.name, backPickupLat: p.lat, backPickupLng: p.lng }))} toast={toast} />
            <PlaceField blockId="F420" label={t("퇴근 하차 지점")} placeholder={t("예: 수원 영통역 2번 출구")} value={place(x.backDropoff, x.backDropoffLat, x.backDropoffLng)} onChange={(p) => setX((o) => ({ ...o, backDropoff: p.name, backDropoffLat: p.lat, backDropoffLng: p.lng }))} toast={toast} />
          </>
        )}
      </section>

      <section className={box}>
        <p className="text-[16px] font-semibold text-ink">{t("약속")}</p>
        <div className="space-y-1">
          <p className="text-[14px] text-sub">{t("기다려 주는 시간")}</p>
          <div className="flex flex-wrap gap-1.5">
            {WAIT_OPTIONS.map((m) => (
              <button key={m} type="button" data-block-id="B429" data-block-name={`기다려 주는 시간 ${m}분`} aria-pressed={x.waitMin === m} className={chip(x.waitMin === m)} onClick={() => set("waitMin", m)}>{m}{t("분")}</button>
            ))}
          </div>
        </div>
        <label className={lbl}>{t("정산 방법")}<input className={field} maxLength={100} value={x.settle} onChange={(e) => set("settle", e.target.value)} placeholder={t("예: 매주 금요일 계좌이체(후불)")} required /></label>
        <label className={lbl}>{t("취소는 언제까지 알려야 하나요")}<select className={field} value={x.cancelNotice} onChange={(e) => set("cancelNotice", e.target.value)}>{CANCEL_OPTIONS.map((o) => <option key={o} value={o}>{t(o)}</option>)}</select></label>
        <label className={lbl}>{t("알리지 않고 불참하면")}<select className={field} value={x.noShow} onChange={(e) => set("noShow", e.target.value)}>{NOSHOW_OPTIONS.map((o) => <option key={o} value={o}>{t(o)}</option>)}</select></label>
        <label className={lbl}>{t("중도 해지는 며칠 전에 알릴까요")}<input type="number" min={0} max={60} inputMode="numeric" className={field} value={x.terminateDays} onChange={(e) => set("terminateDays", Number(e.target.value))} /></label>
        <label className={lbl}>{t("추가 약속(선택)")}<textarea className={field} rows={3} maxLength={500} value={x.extra} onChange={(e) => set("extra", e.target.value)} placeholder={t("예: 비 오는 날은 집 앞까지, 차 안에서 음식 금지")} /></label>
      </section>

      <div className="rounded-xl bg-bg px-4 py-3 text-[12px] leading-relaxed text-sub">
        <p className="mb-1 font-semibold text-ink">{t("기본 조항(모든 계약서에 들어가요)")}</p>
        <ol className="list-decimal space-y-0.5 pl-4">{FIXED_CLAUSES.map((f) => <li key={f}>{t(f)}</li>)}</ol>
      </div>
      <button data-block-id="B420" data-block-name="계약서 보내기" className={btnPrimary} disabled={busy}>{busy ? t("보내는 중…") : t("동의하고 상대에게 보내기")}</button>
      <button type="button" className={btnGhost} onClick={onCancel}>{t("취소")}</button>
    </form>
  );
}

/** 대화방의 [정기카풀 계약서] 창 */
export default function ContractSheet({ requestId, onClose, toast }: { requestId: string; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [writing, setWriting] = useState<ContractTerms | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOld, setShowOld] = useState(false);

  const load = async () => {
    const r = await api<Data>(`/api/contracts?req=${requestId}`);
    if (!r.ok) return setErr(t(r.error));
    setD(r.data);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  const act = async (action: "sign" | "end", id: string, ask: string) => {
    if (!window.confirm(t(ask))) return;
    setBusy(true);
    const r = await api("/api/contracts", "POST", { action, id });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(t(action === "sign" ? "동의했어요." : "처리했어요."));
    void load();
  };

  const latest = d?.contracts[0];
  const signed = d?.contracts.find((c) => c.status === "signed");
  const iDrive = d ? d.me === d.driverId : false;
  const mySigned = latest ? (iDrive ? latest.driverSignedAt : latest.riderSignedAt) : null;
  const fresh = d ? defaultTerms(d.post) : null;
  // 예전 판(항목이 적은 판)도 고칠 수 있게 기본값과 합친다.
  const norm = (x: ContractTerms): ContractTerms => ({ ...(fresh as ContractTerms), ...x, backOn: x.backOn ?? !!x.timeBack });
  const base = latest ? norm(latest.terms) : fresh;

  const body = (
    <Sheet title={t("정기카풀 계약서")} blockId="S415" onClose={onClose}>
      <div className="space-y-4">
        {err && <p className="text-warn">{err}</p>}
        {!d && !err && <p className="py-8 text-center text-sub">{t("불러오는 중…")}</p>}
        {d && writing && <Form requestId={requestId} base={writing} toast={toast} onCancel={() => setWriting(null)} onSent={() => { setWriting(null); void load(); }} />}
        {d && !writing && (
          <>
            {!latest && (
              <div className="space-y-3 rounded-2xl bg-bg p-5 text-center">
                <p className="text-[16px] font-semibold text-ink">{t("아직 계약서가 없어요")}</p>
                <p className="text-[14px] leading-relaxed text-sub">{t("한 달 단위로 요일·시간·비용·취소 약속을 적어 두면 나중에 문제가 생겨도 서로 지킬 기준이 돼요.")}</p>
                {d.canWrite ? (
                  <button data-block-id="B421" data-block-name="계약서 쓰기" className={btnPrimary} onClick={() => base && setWriting(base)}>{t("계약서 쓰기")}</button>
                ) : (
                  <p className="text-[13px] text-warn">{t("정기카풀 신청이 수락된 뒤에 쓸 수 있어요.")}</p>
                )}
              </div>
            )}
            {latest && latest.status === "proposed" && (
              <div className="space-y-2">
                {mySigned ? (
                  <p className="rounded-xl bg-accentSoft px-4 py-3 text-[14px] text-accent">{t("상대의 동의를 기다리고 있어요.")}</p>
                ) : (
                  <p className="rounded-xl bg-warnSoft px-4 py-3 text-[14px] font-semibold text-warn">{t("상대가 계약서를 보냈어요. 내용을 확인하고 동의해 주세요.")}</p>
                )}
                <Doc c={latest} d={d} />
                {!mySigned && <button data-block-id="B422" data-block-name="계약서 동의" className={btnPrimary} disabled={busy} onClick={() => act("sign", latest.id, "이 계약서 내용에 동의할까요? 동의하면 체결되고 시각이 기록돼요.")}>{t("동의하기")}</button>}
                {d.canWrite && <button data-block-id="B423" data-block-name="고쳐서 다시 보내기" className={btnGhost} onClick={() => setWriting(norm(latest.terms))}>{t("고쳐서 다시 보내기")}</button>}
                {mySigned && <button type="button" data-block-id="B424" className="w-full py-2 text-[14px] text-sub underline" disabled={busy} onClick={() => act("end", latest.id, "보낸 계약서 제안을 취소할까요?")}>{t("제안 취소")}</button>}
              </div>
            )}
            {signed && (latest?.status !== "proposed" || signed.id !== latest?.id) && (
              <div className="space-y-2">
                {latest?.status === "proposed" && <p className="pt-2 text-[14px] font-semibold text-ink">{t("지금 유효한 계약")}</p>}
                <Doc c={signed} d={d} />
                {latest?.status !== "proposed" && d.canWrite && <button data-block-id="B425" data-block-name="계약 내용 바꾸기" className={btnGhost} onClick={() => setWriting(norm(signed.terms))}>{t("내용 바꾸기(새 판 보내기)")}</button>}
                <button type="button" data-block-id="B426" data-block-name="계약 해지" className="w-full py-2 text-[14px] text-warn underline" disabled={busy} onClick={() => act("end", signed.id, "계약을 해지할까요? 계약서의 중도 해지 약속(통보 기간·정산)을 지켜 주세요.")}>{t("계약 해지")}</button>
              </div>
            )}
            {latest && !signed && latest.status !== "proposed" && (
              <div className="space-y-2">
                <Doc c={latest} d={d} />
                {d.canWrite && <button data-block-id="B421" data-block-name="계약서 쓰기" className={btnPrimary} onClick={() => setWriting(norm(latest.terms))}>{t("새 계약서 쓰기")}</button>}
              </div>
            )}
            {d.contracts.length > 1 && (
              <div className="space-y-2">
                <button type="button" className="min-h-0 text-[14px] text-sub underline" onClick={() => setShowOld((v) => !v)}>{showOld ? t("지난 판 접기") : `${t("지난 판 보기")} (${d.contracts.length - 1})`}</button>
                {showOld && d.contracts.filter((c) => c.id !== latest?.id && c.id !== signed?.id).map((c) => <Doc key={c.id} c={c} d={d} />)}
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}

/** 내 정보 › 내 계약서 목록 */
export function MyContracts({ onOpen }: { onOpen: (requestId: string) => void }) {
  const t = useT();
  const [list, setList] = useState<(Contract & { requestId: string; iDrive: boolean; other: string })[] | null>(null);
  useEffect(() => {
    api<{ contracts: (Contract & { requestId: string; iDrive: boolean; other: string })[] }>("/api/contracts?mine=1").then((r) => setList(r.ok ? r.data.contracts : []));
  }, []);
  if (list === null) return <p className="px-2 py-3 text-[14px] text-sub">{t("불러오는 중…")}</p>;
  if (!list.length) return <p className="rounded-2xl bg-white px-4 py-6 text-center text-[14px] text-sub">{t("아직 계약서가 없어요. 정기카풀 대화방에서 쓸 수 있어요.")}</p>;
  return (
    <ul className="divide-y divide-line rounded-2xl bg-white">
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" data-block-id="B427" data-block-name="내 계약서 열기" onClick={() => onOpen(c.requestId)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{c.terms.origin} → {c.terms.dest}</span>
              <span className="block text-[13px] text-sub">{c.other} · {c.iDrive ? t("내가 운전") : t("내가 탑승")} · {c.terms.startDate} ~ {c.terms.endDate}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${c.status === "signed" ? "bg-mintSoft text-mint" : c.status === "proposed" ? "bg-accentSoft text-accent" : "bg-bg text-sub"}`}>{t(STATUS_LABEL[c.status] ?? c.status)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
