"use client";
import { useCallback, useEffect, useState } from "react";
import { FEEDBACK_STATUS, catLabel, statusLabel } from "@/lib/feedback";

type Warp = { code: string; email: string; credits: number; found: boolean; emailMatch: boolean; sameAccount: boolean; joined: string; withdrawn: boolean; codePaid: boolean };
type Item = { id: number; name: string; email: string; member: boolean; category: string; body: string; status: string; reply: string; reward: number; rewardedAt: number; at: number; warp: Warp | null };

/** 크레딧 이관 신청 대조 한 줄 */
function Check({ ok, label, bad }: { ok: boolean; label: string; bad: string }) {
  return <li className={ok ? "text-accent" : "font-semibold text-warn"}>{ok ? "✓" : "✕"} {ok ? label : bad}</li>;
}
const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";

export default function AdminFeedback() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState<Record<number, { status: string; reply: string }>>({});
  const [msg, setMsg] = useState("");
  const [amt, setAmt] = useState<Record<number, string>>({});
  const [paying, setPaying] = useState<number | null>(null);

  const load = useCallback(async (f = filter) => {
    const r = await fetch(`/api/admin/feedback?status=${f}`).then((x) => x.json()).catch(() => null);
    if (r?.items) {
      setItems(r.items);
      setCounts(r.counts ?? {});
    }
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (it: Item) => {
    const e = edit[it.id] ?? { status: it.status, reply: it.reply };
    const r = await fetch("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, ...e }) });
    setMsg(r.ok ? (e.reply && e.reply !== it.reply && it.member ? "저장했습니다. 회원에게 답변 알림을 보냈습니다." : "저장했습니다.") : "저장하지 못했습니다.");
    load();
  };

  /** 의견 보낸 회원에게 크레딧 지급 + 푸시. 한 번만 지급되고, 지급 후에는 기록만 보인다. */
  const pay = async (it: Item) => {
    const amount = Math.round(Number(amt[it.id]));
    if (!(amount >= 1)) return setMsg("지급할 크레딧을 입력해 주세요.");
    if (!window.confirm(`${it.name || "회원"}님에게 ${amount.toLocaleString("ko-KR")} 크레딧을 지급할까요? 지급 후에는 되돌릴 수 없고, 회원에게 푸시 알림이 갑니다.`)) return;
    setPaying(it.id);
    const r = await fetch("/api/admin/feedback/reward", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, amount }) }).then((x) => x.json()).catch(() => null);
    setPaying(null);
    if (!r?.ok) return setMsg(r?.error ?? "지급하지 못했습니다.");
    setMsg(r.pushed > 0
      ? `${amount.toLocaleString("ko-KR")} 크레딧을 지급했고 푸시 알림을 보냈습니다.`
      : `${amount.toLocaleString("ko-KR")} 크레딧을 지급했지만 푸시가 가지 않았습니다. 회원이 알림을 켜지 않았거나 기기 구독이 없습니다.`);
    load();
  };

  /** 워프 크레딧 이관: 신청한 크레딧을 한 번에 지급 + 푸시 + 메일 */
  const payWarp = async (it: Item) => {
    if (!it.warp) return;
    const w = it.warp;
    const allOk = w.found && w.emailMatch && w.sameAccount && !w.codePaid && !w.withdrawn;
    if (!window.confirm(`${it.name || "회원"}님에게 워프 크레딧 ${w.credits.toLocaleString("ko-KR")}을 지급할까요?${allOk ? "" : "\n\n대조 결과에 맞지 않는 항목이 있어요. 워프 관리자 화면에서 직접 확인하셨나요?"}\n지급 후에는 되돌릴 수 없고, 회원에게 푸시와 메일이 갑니다.`)) return;
    setPaying(it.id);
    const r = await fetch("/api/admin/feedback/reward", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id, warp: true }) }).then((x) => x.json()).catch(() => null);
    setPaying(null);
    if (!r?.ok) return setMsg(r?.error ?? "지급하지 못했습니다.");
    setMsg(`${r.amount.toLocaleString("ko-KR")} 크레딧을 지급했습니다 · 푸시 ${r.pushed > 0 ? "보냄" : "못 보냄(알림 꺼짐)"} · 메일 ${r.mailed ? "보냄" : "못 보냄(수신거부 등)"}`);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[["", "전체"], ...FEEDBACK_STATUS].map(([k, l]) => (
          <button key={k} onClick={() => { setFilter(k); load(k); }} aria-pressed={filter === k} className={`rounded-full border px-4 py-1.5 text-sm ${filter === k ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
            {l}{k && counts[k] ? ` ${counts[k]}` : ""}
          </button>
        ))}
        {msg && <p role="status" className="ml-2 text-sm text-accent">{msg}</p>}
      </div>
      <ul data-block-id="S140" data-block-name="의견 목록" className="space-y-3">
        {items.map((it) => {
          const e = edit[it.id] ?? { status: it.status, reply: it.reply };
          return (
            <li key={it.id} className="space-y-2 rounded-2xl border border-line bg-white p-5 shadow-card">
              <p className="flex flex-wrap items-center gap-2 text-sm text-sub">
                <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-ink">{catLabel(it.category)}</span>
                <span>{it.member ? it.name || "회원" : "비회원"}</span>
                {it.email && <span>{it.email}</span>}
                <span className="num">{new Date(it.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${it.status === "new" ? "bg-warnSoft text-warn" : "bg-accentSoft text-accent"}`}>{statusLabel(it.status)}</span>
              </p>
              <p className="whitespace-pre-wrap break-words text-[15px]">{it.body}</p>
              {it.warp && (
                <div data-block-id="C426" data-block-name="크레딧 이관 대조" className="space-y-2 rounded-xl border border-line bg-bg p-3 text-sm">
                  <p className="font-semibold">워프 고유번호 <span className="num">{it.warp.code}</span> · 워프 메일 {it.warp.email} · 신청 <b className="num">{it.warp.credits.toLocaleString("ko-KR")}</b> 크레딧</p>
                  <ul className="space-y-0.5">
                    <Check ok={it.warp.found} label={`워프 명단에 있음${it.warp.joined ? ` (가입 ${it.warp.joined})` : ""}`} bad="워프 명단에 이 고유번호가 없음 — 최근 명단을 올렸는지 확인" />
                    {it.warp.found && <Check ok={it.warp.emailMatch} label="명단의 메일과 같음" bad="명단의 메일과 다름" />}
                    <Check ok={it.warp.sameAccount} label="신청한 계정과 같은 사람" bad="신청한 계정과 워프 회원이 이어져 있지 않음" />
                    {it.warp.withdrawn && <Check ok={false} label="" bad="워프에서 탈퇴한 회원" />}
                    <Check ok={!it.warp.codePaid} label="이 고유번호로 받은 적 없음" bad="이 고유번호로 이미 지급함" />
                  </ul>
                  <p className="text-[13px] text-sub">보유 크레딧은 명단에 없어서, 워프 관리자 화면에서 금액을 확인한 뒤 눌러 주세요.</p>
                  {it.rewardedAt ? (
                    <p className="font-semibold text-accent">{it.reward.toLocaleString("ko-KR")} 크레딧 지급 완료 ({new Date(it.rewardedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })})</p>
                  ) : (
                    <button type="button" data-block-id="B474" data-block-name="워프 크레딧 지급" disabled={paying === it.id || it.warp.codePaid} onClick={() => payWarp(it)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {paying === it.id ? "지급 중…" : `확인 · ${it.warp.credits.toLocaleString("ko-KR")} 크레딧 지급`}
                    </button>
                  )}
                </div>
              )}
              {it.member && !it.warp && (
                it.rewardedAt ? (
                  <p className="text-sm text-accent">크레딧 {it.reward.toLocaleString("ko-KR")} 지급 완료 ({new Date(it.rewardedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })})</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input data-block-id="F140" aria-label="지급 크레딧" inputMode="numeric" className={`${input} w-36`} placeholder="크레딧 금액" value={amt[it.id] ?? ""} onChange={(x) => setAmt({ ...amt, [it.id]: x.target.value.replace(/[^0-9]/g, "") })} />
                    <button type="button" data-block-id="B141" data-block-name="의견 크레딧 지급" disabled={paying === it.id} className="rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent disabled:opacity-50" onClick={() => pay(it)}>{paying === it.id ? "지급 중…" : "크레딧 지급 + 푸시"}</button>
                  </div>
                )
              )}
              <div className="flex flex-wrap gap-2">
                <select aria-label="상태" className={`${input} w-32`} value={e.status} onChange={(x) => setEdit({ ...edit, [it.id]: { ...e, status: x.target.value } })}>
                  {FEEDBACK_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <textarea aria-label="답변" className={`${input} min-w-[240px] flex-1`} rows={2} maxLength={2000} placeholder={it.member ? "답변 (회원의 '내가 보낸 의견'에 보이고 푸시로 알림)" : "메모 (비회원은 이메일로 직접 답해 주세요)"} value={e.reply} onChange={(x) => setEdit({ ...edit, [it.id]: { ...e, reply: x.target.value } })} />
                <button data-block-id="B140" data-block-name="의견 저장" className="rounded-lg bg-accent px-4 text-sm font-semibold text-white" onClick={() => save(it)}>저장</button>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && <p className="py-8 text-center text-sub">받은 의견이 없습니다.</p>}
    </div>
  );
}
