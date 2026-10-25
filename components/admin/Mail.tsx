"use client";
import { useCallback, useEffect, useState } from "react";

type Policy = { dailyCap: number; monthlyCap: number; cycleDay: number; quietOn: boolean; quietFrom: number; quietTo: number; marketingOn: boolean; requireConsent: boolean };
type Log = { id: string; created_at: number; kind: string; category: string; to_email: string; subject: string; status: string; error: string; provider_id: string; user_name: string | null };
type Received = { unsub: number; withdrawn: number; purged: number; waiting: number; legacyPhone?: number; userPhone?: number;
  apple?: { nwt: number; nwt_ph: number; members: number; members_ph: number; old: number; old_ph: number } };
type Allowance = { auto: boolean; cap: number; left: number; sentToday: number; monthSent: number; monthlyCap: number; daysLeft: number };
type Data = { policy: Policy; allowance?: Allowance; defaults: Policy; kinds: string[]; suppressed: number; received: Received; today: { sent: number; marketing_sent: number; campaign_sent?: number; blocked: number; failed: number }; logs: Log[] };

const input = "rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const KIND: Record<string, string> = {
  reset: "비밀번호 재설정", verify: "이메일 인증", "legacy-confirm": "워프 회원 확인", nudge: "메시지 알림",
  "notify-request": "신청 알림", "notify-accepted": "수락 알림", "notify-hello": "첫 메시지 알림",
  withdraw: "탈퇴 확인", purge: "개인정보 삭제 확인", suspend: "이용 정지 안내",
};
const STATUS: Record<string, [string, string]> = {
  sent: ["발송", "text-accent"], failed: ["실패", "text-warn"], blocked: ["차단", "text-warn"],
  dryrun: ["테스트", "text-sub"], disabled: ["비활성", "text-sub"],
};
const CATEGORY: Record<string, string> = { transactional: "안내", marketing: "광고성" };
const when = (t: number) => new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AdminMail() {
  const [d, setD] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (f = { status, category, kind, q }) => {
    setLoading(true);
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const r = await fetch(`/api/admin/mail?${p}`);
    setLoading(false);
    if (!r.ok) return setMsg((await r.json().catch(() => ({}))).error ?? "불러오지 못했습니다.");
    const j = (await r.json()) as Data;
    setD(j);
    setDraft((cur) => cur ?? j.policy);
  }, [status, category, kind, q]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePolicy = async () => {
    if (!draft) return;
    const r = await fetch("/api/admin/mail", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setMsg("발송 정책을 저장했습니다.");
    load();
  };

  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setDraft((cur) => (cur ? { ...cur, [k]: v } : cur));
  const changed = d && draft && JSON.stringify(d.policy) !== JSON.stringify(draft);
  const tile = (label: string, value: string, sub = "") => (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-[13px] text-sub">{label}</p>
      <p className="num text-[22px] font-bold">{value}</p>
      {sub && <p className="text-[12px] text-sub">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-xl bg-accentSoft px-4 py-3 text-[15px] text-accent">{msg}</p>}

      {d && draft && (
        <>
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">메일로 접수된 인원</h2>
                <p className="text-[13px] text-sub">메일의 수신거부 링크, 탈퇴·개인정보 삭제 확인 링크로 처리된 요청입니다. 이름·전화번호는 내려받지 않습니다.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href="/api/admin/mail/lists?list=suppressed" className="rounded-xl bg-accent px-4 py-2.5 text-[15px] font-semibold text-white">수신거부 명단 받기 (CSV)</a>
                <a href="/api/admin/mail/lists?list=claims" className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink">메일 접수 명단 받기 (CSV)</a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {tile("수신거부 접수", `${d.received.unsub.toLocaleString("ko-KR")}명`, "메일 하단 수신거부 링크")}
              {tile("탈퇴 확인 완료", `${d.received.withdrawn.toLocaleString("ko-KR")}명`, "메일 링크로 탈퇴")}
              {tile("개인정보만 삭제", `${d.received.purged.toLocaleString("ko-KR")}명`, "계정 유지, 개인정보 삭제")}
              {tile("확인 대기", `${d.received.waiting.toLocaleString("ko-KR")}명`, "링크 72시간 안에 누르지 않음")}
              {d.received.legacyPhone !== undefined && tile("휴대폰 번호 보관 중", `${((d.received.legacyPhone ?? 0) + (d.received.userPhone ?? 0)).toLocaleString("ko-KR")}명`, `워프 ${(d.received.legacyPhone ?? 0).toLocaleString("ko-KR")} · 가입 회원 ${(d.received.userPhone ?? 0).toLocaleString("ko-KR")} (삭제 동의 전)`)}
            </div>
          </section>

          {d.received.apple && (() => {
            const a = d.received.apple;
            const f = (v: number) => v.toLocaleString("ko-KR");
            return (
              <section data-block-id="S402" data-block-name="문자 전용(아이폰 메일)" className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-bold">문자 전용 · 아이폰 메일 {f(a.nwt + a.members + a.old)}명</h2>
                    <p className="text-[13px] text-sub">icloud.com·me.com·mac.com·애플 이메일 가리기(privaterelay) 주소는 메일이 닿지 않아 모든 대량 메일 대상에서 자동으로 빠집니다. 문자로만 안내해요. 괄호는 전화번호 있는 인원.</p>
                  </div>
                  <a href="/api/admin/mail/lists?list=apple" data-block-id="B403" className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink">문자 전용 명단 받기 (CSV)</a>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {tile("신워프 임시가입", `${f(a.nwt)}명`, `전화 ${f(a.nwt_ph)}`)}
                  {tile("그 밖의 가입 회원", `${f(a.members)}명`, `전화 ${f(a.members_ph)}`)}
                  {tile("구워프 (계정 없음)", `${f(a.old)}명`, `전화 ${f(a.old_ph)}`)}
                </div>
              </section>
            );
          })()}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tile("오늘 발송", `${d.today.sent.toLocaleString("ko-KR")}통`)}
            {tile("오늘 대량 발송", `${(d.today.campaign_sent ?? 0).toLocaleString("ko-KR")} / ${(d.allowance?.cap ?? draft.dailyCap).toLocaleString("ko-KR")}`, d.allowance?.auto ? "월 한도에 맞춘 오늘 몫(자동)" : "하루 한도 대비(꼭 필요한 메일은 한도 없음)")}
            {d.allowance && tile("이번 달 사용", `${d.allowance.monthSent.toLocaleString("ko-KR")} / ${d.allowance.monthlyCap.toLocaleString("ko-KR")}`, `모든 메일 합계 · 주기 끝까지 ${d.allowance.daysLeft}일`)}
            {tile("오늘 차단", `${d.today.blocked.toLocaleString("ko-KR")}통`, "정책으로 보내지 않음")}
            {tile("오늘 실패", `${d.today.failed.toLocaleString("ko-KR")}통`)}
            {tile("발송 제외 주소", `${d.suppressed.toLocaleString("ko-KR")}개`, "수신거부·반송·스팸 신고")}
          </div>

          <section className="space-y-4 rounded-2xl bg-white p-5 shadow-card">
            <div>
              <h2 className="text-[17px] font-bold">발송 정책</h2>
              <p className="text-[13px] text-sub">안내 메일(가입·비밀번호·신청 알림 등)은 정책과 관계없이 보냅니다. 아래 정책은 광고성·홍보성 메일에만 적용합니다.</p>
            </div>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={draft.marketingOn} onChange={(e) => set("marketingOn", e.target.checked)} />
              광고성 메일 발송 허용
            </label>
            <label className="flex flex-wrap items-center gap-2 text-[15px]">
              하루 대량(캠페인) 메일 한도
              <input type="number" min={0} max={100000} className={`${input} w-32`} value={draft.dailyCap} onChange={(e) => set("dailyCap", Number(e.target.value))} />
              통
              <button type="button" className={`rounded-lg border px-2.5 py-1 text-[13px] ${draft.dailyCap === 0 ? "border-accent font-semibold text-accent" : "border-line text-sub"}`} onClick={() => set("dailyCap", 0)}>자동(월 한도 기준)</button>
              <span className="w-full text-[13px] text-sub">0 = 자동: (월 한도 − 이번 달 보낸 양 − 꼭 필요한 메일 몫 10%) ÷ 남은 날수만큼 매일 최대로 보냅니다. 덜 보낸 날이 있으면 다음 날 몫이 늘어납니다.</span>
            </label>
            <label className="flex flex-wrap items-center gap-2 text-[15px]">
              Resend 월 한도
              <input type="number" min={100} className={`${input} w-32`} value={draft.monthlyCap} onChange={(e) => set("monthlyCap", Number(e.target.value))} />
              통 · 결제 주기 시작일 매월
              <input type="number" min={1} max={31} className={`${input} w-20`} value={draft.cycleDay} onChange={(e) => set("cycleDay", Number(e.target.value))} />
              일
              <span className="w-full text-[13px] text-sub">Pro 50,000통 · Scale 100,000통. 요금제를 바꾸면 여기 숫자만 고치세요.</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[15px]">
                <input type="checkbox" checked={draft.quietOn} onChange={(e) => set("quietOn", e.target.checked)} />
                야간 발송 제한
              </label>
              <p className="flex flex-wrap items-center gap-2 pl-6 text-[15px]">
                <input type="number" min={0} max={23} className={`${input} w-20`} value={draft.quietFrom} disabled={!draft.quietOn} onChange={(e) => set("quietFrom", Number(e.target.value))} />
                시부터
                <input type="number" min={0} max={23} className={`${input} w-20`} value={draft.quietTo} disabled={!draft.quietOn} onChange={(e) => set("quietTo", Number(e.target.value))} />
                시까지는 광고성 메일을 보내지 않음 (한국 시간)
              </p>
            </div>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={draft.requireConsent} onChange={(e) => set("requireConsent", e.target.checked)} />
              광고성 메일은 수신 동의한 가입 회원에게만 (동의 없거나 비회원이면 차단)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={!changed} onClick={savePolicy} className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-white disabled:opacity-40">정책 저장</button>
              {changed && <button type="button" onClick={() => setDraft(d.policy)} className="text-[15px] text-sub underline">되돌리기</button>}
            </div>
          </section>
        </>
      )}

      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
        <div className="flex flex-wrap gap-2">
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="상태">
            <option value="">상태 전체</option>
            {Object.entries(STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="구분">
            <option value="">구분 전체</option>
            <option value="transactional">안내</option>
            <option value="marketing">광고성</option>
          </select>
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="종류">
            <option value="">종류 전체</option>
            {d?.kinds.map((k) => <option key={k} value={k}>{KIND[k] ?? k}</option>)}
          </select>
          <input className={`${input} min-w-[200px] flex-1`} placeholder="받는 사람 이메일 또는 제목" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          <button type="button" onClick={() => load()} disabled={loading} className="rounded-xl bg-accent px-5 font-semibold text-white disabled:opacity-40">{loading ? "불러오는 중" : "조회"}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-sub">
              <tr>{["발송 시각", "종류", "구분", "받는 사람", "제목", "상태", "비고"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d?.logs.map((l) => (
                <tr key={l.id}>
                  <td className="num whitespace-nowrap px-2 py-2">{when(l.created_at)}</td>
                  <td className="px-2 py-2">{KIND[l.kind] ?? l.kind}</td>
                  <td className="px-2 py-2">{CATEGORY[l.category] ?? l.category}</td>
                  <td className="px-2 py-2">{l.to_email}{l.user_name && <span className="block text-xs text-sub">{l.user_name}</span>}</td>
                  <td className="max-w-[320px] truncate px-2 py-2">{l.subject}</td>
                  <td className={`px-2 py-2 font-semibold ${STATUS[l.status]?.[1] ?? ""}`}>{STATUS[l.status]?.[0] ?? l.status}</td>
                  <td className="max-w-[260px] px-2 py-2 text-xs text-sub">{l.error || (l.provider_id ? `ID ${l.provider_id.slice(0, 8)}` : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d && d.logs.length === 0 && <p className="py-6 text-center text-sub">발송 이력이 없습니다.</p>}
        </div>
        <p className="text-xs text-sub">최근 300건까지 보입니다. 이력은 발송 시점에 자동으로 쌓입니다.</p>
      </section>
    </div>
  );
}
