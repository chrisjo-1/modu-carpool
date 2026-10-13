"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, Icon, api, useLang, useT } from "./ui";

type Rules = { signup: number; attend: number; post: number; nudge: number; legacy: number; car: number };
type Item = { id: string; amount: number; reason: string; label: string; memo: string; at: number };
type Data = { balance: number; attended: boolean; welcome: number; rules: Rules; callCost?: number; historyCount: number; warpHidden?: boolean };

export const creditText = (n: number, lang: string) => `${n.toLocaleString(lang === "ko" ? "ko-KR" : "en-US")}`;

/** 내 정보: 크레딧 잔액, 출석하기, 적립 기준, 최근 내역 */
export default function CreditCard({ toast, version }: { toast: (m: string) => void; version: number }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // 내역은 처음엔 접어 두고, 버튼을 누르면 20건씩 불러온다.
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [more, setMore] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [loading, setLoading] = useState(false);
  const [warpCode, setWarpCode] = useState("");
  const [warpBusy, setWarpBusy] = useState(false);
  // '예'를 누르면 고유번호 입력칸을 펼친다.
  const [warpOpen, setWarpOpen] = useState(false);
  const loadHistory = async (reset: boolean) => {
    setLoading(true);
    const before = !reset && items.length ? `&before=${items[items.length - 1].id}` : "";
    const r = await api<{ items: Item[]; more: boolean }>(`/api/credits?history=1${before}`);
    setLoading(false);
    if (!r.ok) return toast(t(r.error));
    setItems((cur) => (reset ? r.data.items : [...cur, ...r.data.items]));
    setMore(r.data.more);
  };
  const toggle = () => {
    if (!open) loadHistory(true);
    setOpen((v) => !v);
  };

  const load = useCallback(async (first = false) => {
    const r = await api<Data>("/api/credits");
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setD(r.data);
    if (first && r.data.welcome > 0) toast(`${t("가입 축하 크레딧이 적립됐어요.")} +${creditText(r.data.welcome, lang)}`);
    // 처음 한 번만 환영 알림을 띄운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load(true);
  }, [load]);
  useEffect(() => {
    if (version) load();
  }, [version, load]);
  // 잔액이 바뀌면(출석 등) 펼쳐 둔 내역도 새로 받는다.
  useEffect(() => {
    if (open) loadHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.balance, d?.historyCount]);

  const attend = async () => {
    setBusy(true);
    const r = await api<{ added: number; balance: number }>("/api/credits", "POST", { action: "attend" });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(`${t("출석 완료!")} +${creditText(r.data.added, lang)} ${t("크레딧")}`);
    load();
  };

  const claimWarp = async () => {
    const code = warpCode.trim().toUpperCase();
    setWarpBusy(true);
    const r = await api<{ added: number; balance: number }>("/api/credits", "POST", { action: "claimWarp", code });
    setWarpBusy(false);
    if (!r.ok) return toast(t(r.error));
    setWarpCode("");
    toast(`${t("워프 회원 크레딧이 적립됐어요.")} +${creditText(r.data.added, lang)} ${t("크레딧")}`);
    load();
  };

  // '아니오'를 누르면 저장해 두고 다시 묻지 않는다.
  const answerNo = async () => {
    setD((cur) => (cur ? { ...cur, warpHidden: true } : cur));
    const r = await api("/api/credits", "POST", { action: "warpNo" });
    if (!r.ok) toast(t(r.error));
  };

  // 데이터가 오기 전에도 카드 틀을 먼저 보여 빈 화면처럼 보이지 않게 한다.
  if (!d) {
    return (
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("크레딧")}</h2>
        <Card data-block-id="C048" data-block-name="크레딧" className="space-y-4 p-5" aria-busy={!failed}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-sub">{t("보유 크레딧")}</p>
              <p className="num text-[28px] font-bold leading-tight text-sub">{failed ? "-" : "…"}</p>
            </div>
          </div>
          {failed ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3 text-[14px]">
              <span className="text-sub">{t("크레딧을 불러오지 못했어요.")}</span>
              <button type="button" data-block-id="B290" data-block-name="크레딧 다시 불러오기" className="min-h-0 font-semibold text-accent underline" onClick={() => load(true)}>{t("다시 시도")}</button>
            </div>
          ) : (
            <p role="status" className="py-2 text-center text-[13px] text-sub">{t("불러오는 중…")}</p>
          )}
        </Card>
      </div>
    );
  }
  const rules: [string, string][] = [
    [t("가입 축하"), `+${creditText(d.rules.signup, lang)}`],
    [t("출석하기 (하루 1번)"), `+${creditText(d.rules.attend, lang)}`],
    [t("카풀 게시 (하루 1번)"), `+${creditText(d.rules.post, lang)}`],
    [t("채팅에서 메일로 알리기"), `−${creditText(d.rules.nudge, lang)}`],
    [t("CALL 호출 (글 1건)"), `−${creditText(d.callCost ?? 1000, lang)}`],
    [t("택시동승 호출"), t("무료")],
    [t("차량 등록 축하"), `+${creditText(d.rules.car ?? 0, lang)}`],
    ...(d.rules.legacy ? [[t("워프 회원 이전 축하"), `+${creditText(d.rules.legacy, lang)}`] as [string, string]] : []),
  ];

  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("크레딧")}</h2>
      <Card data-block-id="C048" data-block-name="크레딧" className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-sub">
              {t("보유 크레딧")}
              <button type="button" data-block-id="B212" data-block-name="적립 기준 보기" aria-expanded={showRules} aria-controls="credit-rules" aria-label={t(showRules ? "적립 기준 숨기기" : "적립 기준 보기")} title={t(showRules ? "적립 기준 숨기기" : "적립 기준 보기")} onClick={() => setShowRules((v) => !v)} className={`flex h-5 w-5 min-h-0 items-center justify-center rounded-full border text-[12px] font-bold leading-none ${showRules ? "border-accent bg-accent text-white" : "border-sub text-sub"}`}>
                i
              </button>
            </p>
            <p className="num text-[28px] font-bold leading-tight text-accent">{creditText(d.balance, lang)}</p>
          </div>
          <button data-block-id="B058" data-block-name="출석하기" disabled={busy || d.attended} className="shrink-0 rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-white disabled:bg-bg disabled:text-sub" onClick={attend}>
            {d.attended ? t("오늘 출석 완료") : `${t("출석하기")} +${creditText(d.rules.attend, lang)}`}
          </button>
        </div>
        {showRules && (
        <ul id="credit-rules" data-block-id="C049" data-block-name="적립 기준" className="grid grid-cols-2 gap-2 text-[13px]">
          {rules.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between rounded-xl bg-bg px-3 py-2">
              <span className="text-sub">{k}</span>
              <b className={`num ${v.startsWith("−") ? "text-warn" : "text-accent"}`}>{v}</b>
            </li>
          ))}
        </ul>
        )}
        {!d.warpHidden && (
          <div data-block-id="C056" data-block-name="워프 회원 번호 입력" className="rounded-2xl bg-bg p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold">{t("워프 회원이신가요?")}</p>
              {!warpOpen && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" data-block-id="B276" data-block-name="워프 회원 아니오" onClick={answerNo} className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] text-sub">{t("아니오")}</button>
                  <button type="button" data-block-id="B277" data-block-name="워프 회원 예" onClick={() => setWarpOpen(true)} className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white">{t("예")}</button>
                </div>
              )}
            </div>
            {warpOpen && (
              <div className="mt-3 space-y-2">
                <p className="text-[13px] leading-relaxed text-sub">{t("워프에서 받으신 8자리 고유번호를 입력하면 이전 축하 크레딧을 한 번 받을 수 있어요.")}</p>
                <div className="flex gap-2">
                  <input data-block-id="F215" aria-label={t("워프 고유번호")} className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 font-mono text-[16px] uppercase tracking-wider" maxLength={8} placeholder="0000000A" value={warpCode} onChange={(e) => setWarpCode(e.target.value.toUpperCase())} />
                  <button type="button" data-block-id="B215" data-block-name="워프 번호로 받기" disabled={warpBusy || warpCode.trim().length !== 8} className="shrink-0 rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-white disabled:bg-bg disabled:text-sub" onClick={claimWarp}>{warpBusy ? t("처리 중…") : t("받기")}</button>
                </div>
              </div>
            )}
          </div>
        )}
        {d.historyCount > 0 && (
          <div>
            <button data-block-id="B210" data-block-name="크레딧 내역 보기" aria-expanded={open} aria-controls="credit-history" onClick={toggle} className="flex w-full items-center justify-between rounded-xl border border-line px-4 text-[15px]">
              <span>{open ? t("내역 접기") : t("내역 보기")} <span className="num text-sub">({d.historyCount.toLocaleString("ko-KR")})</span></span>
              <span className={`text-sub transition-transform ${open ? "rotate-90" : ""}`}>{Icon.arrow()}</span>
            </button>
            {open && (
              <div id="credit-history" className="mt-2">
                <ul data-block-id="C210" data-block-name="크레딧 내역" className="divide-y divide-line">
                  {items.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                      <span className="min-w-0">
                        <span className="block truncate">{t(h.label)}{h.memo && <span className="text-sub"> · {h.memo}</span>}</span>
                        <span className="num text-[12px] text-sub">{new Date(h.at).toLocaleString(lang === "ko" ? "ko-KR" : lang, { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      </span>
                      <b className={`num shrink-0 ${h.amount > 0 ? "text-accent" : "text-warn"}`}>{h.amount > 0 ? "+" : "−"}{creditText(Math.abs(h.amount), lang)}</b>
                    </li>
                  ))}
                </ul>
                {loading && <p className="py-2 text-center text-[13px] text-sub">{t("불러오는 중…")}</p>}
                {more && !loading && <button data-block-id="B211" data-block-name="크레딧 내역 더 보기" className="min-h-0 w-full py-2 text-[14px] text-sub underline" onClick={() => loadHistory(false)}>{t("더 보기")}</button>}
              </div>
            )}
          </div>
        )}
        <p className="text-[12px] leading-relaxed text-sub">{t("크레딧은 모두의카풀 안에서만 쓰는 포인트로, 현금으로 바꾸거나 다른 회원에게 줄 수 없어요.")}</p>
      </Card>
    </div>
  );
}
