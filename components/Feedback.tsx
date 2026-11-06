"use client";
import { useEffect, useState } from "react";
import { FEEDBACK_CATS, catLabel, statusLabel } from "@/lib/feedback";
import { Segment, Sheet, api, btnPrimary, field, useLang, useT } from "./ui";

type Item = { id: number; category: string; body: string; status: string; reply: string; at: number };

/** 건의·불편·아이디어를 보내는 창. 로그인하지 않아도 보낼 수 있다. */
export default function FeedbackSheet({ loggedIn, onClose, toast }: { loggedIn: boolean; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [cat, setCat] = useState("suggest");
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  // 크레딧 이관 신청(워프 → 모두의카풀)
  const [warpCode, setWarpCode] = useState("");
  const [warpEmail, setWarpEmail] = useState("");
  const [warpCredits, setWarpCredits] = useState("");
  const credit = cat === "credit";
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  const load = () => loggedIn && api<{ items: Item[] }>("/api/feedback").then((r) => r.ok && setItems(r.data.items));
  // 로그인 확인이 끝난 뒤(알림으로 바로 열린 경우 등)에도 내 의견을 불러온다.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/feedback", "POST", { category: cat, body: text, email, warpCode, warpEmail, warpCredits });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setText("");
    if (credit) {
      setWarpCode("");
      setWarpEmail("");
      setWarpCredits("");
      toast(t("크레딧 이관 신청을 받았어요. 확인 후 옮겨 드리고 알려 드릴게요."));
    } else toast(t("소중한 의견 고마워요. 꼼꼼히 읽어 볼게요."));
    load();
  };

  return (
    <Sheet title={t("의견 보내기")} blockId="S086" onClose={onClose}>
      <form onSubmit={send} className="space-y-3">
        <p className="text-[15px] leading-relaxed text-sub">{t("건의, 불편한 점, 새 아이디어 무엇이든 좋아요. 운영자가 직접 읽고 답해 드려요.")}</p>
        <Segment label={t("종류")} value={cat} onChange={setCat} options={FEEDBACK_CATS.map(([k, l]) => [k, t(k === "credit" ? "크레딧 이관" : l)] as [string, string])} />
        {credit ? (
          <div data-block-id="C425" data-block-name="크레딧 이관 신청" className="space-y-3">
            <p className="text-[16px] font-semibold">{t("크레딧 이관 신청")}</p>
            <p className="rounded-xl bg-bg px-3 py-2 text-[14px] leading-relaxed text-sub">{t("워프에서 쓰던 크레딧을 모두의카풀로 옮겨 드려요. 운영자가 워프 기록과 맞는지 확인한 뒤 지금 로그인한 계정으로 넣어 드리고 알려 드려요.")}</p>
            {!loggedIn ? (
              <p className="text-[15px] font-semibold text-warn">{t("크레딧 이관 신청은 로그인한 뒤에 할 수 있어요.")}</p>
            ) : (
              <>
                <label className="block text-sm text-sub">
                  {t("워프 고유번호")}
                  <input data-block-id="F441" className={`${field} mt-1`} required inputMode="text" autoCapitalize="characters" maxLength={12} placeholder={t("예: 1234567A")} value={warpCode} onChange={(e) => setWarpCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))} />
                </label>
                <label className="block text-sm text-sub">
                  {t("워프에 가입한 메일 주소")}
                  <input data-block-id="F442" className={`${field} mt-1`} required type="email" maxLength={120} value={warpEmail} onChange={(e) => setWarpEmail(e.target.value)} />
                </label>
                <label className="block text-sm text-sub">
                  {t("워프에서 보유한 크레딧")}
                  <input data-block-id="F443" className={`${field} mt-1`} required inputMode="numeric" maxLength={9} placeholder={t("예: 3000")} value={warpCredits} onChange={(e) => setWarpCredits(e.target.value.replace(/[^0-9]/g, ""))} />
                </label>
                <textarea data-block-id="F086" className={field} rows={2} maxLength={500} placeholder={t("전할 말 (선택)")} value={text} onChange={(e) => setText(e.target.value)} />
              </>
            )}
          </div>
        ) : (
          <textarea data-block-id="F086" className={field} rows={6} required minLength={5} maxLength={2000} placeholder={t("자유롭게 적어 주세요.")} value={text} onChange={(e) => setText(e.target.value)} />
        )}
        {!loggedIn && !credit && (
          <label className="block text-sm text-sub">
            {t("답변 받을 이메일 (선택)")}
            <input data-block-id="F087" className={`${field} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        <button data-block-id="B086" data-block-name="의견 보내기" className={btnPrimary} disabled={busy || (credit && !loggedIn)}>{busy ? t("처리 중…") : credit ? t("이관 신청하기") : t("보내기")}</button>
      </form>
      {items.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-sub">{t("내가 보낸 의견")}</p>
          <ul data-block-id="C086" data-block-name="내가 보낸 의견" className="space-y-2">
            {items.map((f) => (
              <li key={f.id} className="rounded-2xl border border-line p-4">
                <p className="flex items-center justify-between gap-2 text-[13px] text-sub">
                  <span>{t(catLabel(f.category))} · {new Date(f.at).toLocaleDateString(lang === "ko" ? "ko-KR" : lang)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${f.reply ? "bg-accentSoft text-accent" : "bg-bg text-sub"}`}>{t(statusLabel(f.status))}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[15px]">{f.body}</p>
                {f.reply && <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-accentSoft px-3 py-2 text-[14px]"><b className="text-accent">{t("운영자 답변")}</b><br />{f.reply}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
