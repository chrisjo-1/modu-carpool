"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, api, useLang, useT } from "./ui";

type Rules = { signup: number; attend: number; post: number; nudge: number; legacy: number };
type Item = { amount: number; reason: string; label: string; memo: string; at: number };
type Data = { balance: number; attended: boolean; welcome: number; rules: Rules; history: Item[] };

export const creditText = (n: number, lang: string) => `${n.toLocaleString(lang === "ko" ? "ko-KR" : "en-US")}`;

/** 내 정보: 크레딧 잔액, 출석하기, 적립 기준, 최근 내역 */
export default function CreditCard({ toast, version }: { toast: (m: string) => void; version: number }) {
  const t = useT();
  const lang = useLang();
  const [d, setD] = useState<Data | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (first = false) => {
    const r = await api<Data>("/api/credits");
    if (!r.ok) return;
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

  const attend = async () => {
    setBusy(true);
    const r = await api<{ added: number; balance: number }>("/api/credits", "POST", { action: "attend" });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(`${t("출석 완료!")} +${creditText(r.data.added, lang)} ${t("크레딧")}`);
    load();
  };

  if (!d) return <div className="h-40 animate-pulse rounded-3xl bg-white" aria-hidden />;
  const rules: [string, string][] = [
    [t("가입 축하"), `+${creditText(d.rules.signup, lang)}`],
    [t("출석하기 (하루 1번)"), `+${creditText(d.rules.attend, lang)}`],
    [t("카풀 게시 (하루 1번)"), `+${creditText(d.rules.post, lang)}`],
    [t("채팅에서 메일로 알리기"), `−${creditText(d.rules.nudge, lang)}`],
    ...(d.rules.legacy ? [[t("워프 회원 이전 축하"), `+${creditText(d.rules.legacy, lang)}`] as [string, string]] : []),
  ];
  const list = all ? d.history : d.history.slice(0, 5);

  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("크레딧")}</h2>
      <Card data-block-id="C048" data-block-name="크레딧" className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-sub">{t("보유 크레딧")}</p>
            <p className="num text-[28px] font-bold leading-tight text-accent">{creditText(d.balance, lang)}</p>
          </div>
          <button data-block-id="B058" data-block-name="출석하기" disabled={busy || d.attended} className="shrink-0 rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-white disabled:bg-bg disabled:text-sub" onClick={attend}>
            {d.attended ? t("오늘 출석 완료") : `${t("출석하기")} +${creditText(d.rules.attend, lang)}`}
          </button>
        </div>
        <ul data-block-id="C049" data-block-name="적립 기준" className="grid grid-cols-2 gap-2 text-[13px]">
          {rules.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between rounded-xl bg-bg px-3 py-2">
              <span className="text-sub">{k}</span>
              <b className={`num ${v.startsWith("−") ? "text-warn" : "text-accent"}`}>{v}</b>
            </li>
          ))}
        </ul>
        {d.history.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold text-sub">{t("최근 내역")}</p>
            <ul data-block-id="C050" data-block-name="크레딧 내역" className="divide-y divide-line">
              {list.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                  <span className="min-w-0">
                    <span className="block truncate">{t(h.label)}{h.memo && <span className="text-sub"> · {h.memo}</span>}</span>
                    <span className="num text-[12px] text-sub">{new Date(h.at).toLocaleString(lang === "ko" ? "ko-KR" : lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                  </span>
                  <b className={`num shrink-0 ${h.amount > 0 ? "text-accent" : "text-warn"}`}>{h.amount > 0 ? "+" : "−"}{creditText(Math.abs(h.amount), lang)}</b>
                </li>
              ))}
            </ul>
            {d.history.length > 5 && <button className="min-h-0 w-full py-2 text-[14px] text-sub underline" onClick={() => setAll((v) => !v)}>{all ? t("접기") : t("전체 보기")}</button>}
          </div>
        )}
        <p className="text-[12px] leading-relaxed text-sub">{t("크레딧은 모두의카풀 안에서만 쓰는 포인트로, 현금으로 바꾸거나 다른 회원에게 줄 수 없어요.")}</p>
      </Card>
    </div>
  );
}
