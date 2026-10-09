"use client";
import { useEffect, useState } from "react";
import { FEEDBACK_CATS, statusLabel } from "@/lib/feedback";
import { Segment, Sheet, api, btnPrimary, field, useLang, useT } from "./ui";

type Item = { id: number; category: string; body: string; status: string; reply: string; at: number };

/** 건의·불편·아이디어를 보내는 창. 로그인하지 않아도 보낼 수 있다. */
export default function FeedbackSheet({ loggedIn, onClose, toast }: { loggedIn: boolean; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [cat, setCat] = useState("suggest");
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
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
    const r = await api("/api/feedback", "POST", { category: cat, body: text, email });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setText("");
    toast(t("소중한 의견 고마워요. 꼼꼼히 읽어 볼게요."));
    load();
  };

  return (
    <Sheet title={t("의견 보내기")} blockId="S086" onClose={onClose}>
      <form onSubmit={send} className="space-y-3">
        <p className="text-[15px] leading-relaxed text-sub">{t("건의, 불편한 점, 새 아이디어 무엇이든 좋아요. 운영자가 직접 읽고 답해 드려요.")}</p>
        <Segment label={t("종류")} value={cat} onChange={setCat} options={FEEDBACK_CATS.map(([k, l]) => [k, t(l)] as [string, string])} />
        <textarea data-block-id="F086" className={field} rows={6} required minLength={5} maxLength={2000} placeholder={t("자유롭게 적어 주세요.")} value={text} onChange={(e) => setText(e.target.value)} />
        {!loggedIn && (
          <label className="block text-sm text-sub">
            {t("답변 받을 이메일 (선택)")}
            <input data-block-id="F087" className={`${field} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        <button data-block-id="B086" data-block-name="의견 보내기" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : t("보내기")}</button>
      </form>
      {items.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-sub">{t("내가 보낸 의견")}</p>
          <ul data-block-id="C086" data-block-name="내가 보낸 의견" className="space-y-2">
            {items.map((f) => (
              <li key={f.id} className="rounded-2xl border border-line p-4">
                <p className="flex items-center justify-between gap-2 text-[13px] text-sub">
                  <span>{t(FEEDBACK_CATS.find(([k]) => k === f.category)?.[1] ?? "기타")} · {new Date(f.at).toLocaleDateString(lang === "ko" ? "ko-KR" : lang)}</span>
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
