"use client";
import { useState } from "react";
import type { User } from "@/lib/types";
import { Consent, type Agree } from "./AuthForm";
import { Sheet, api, btnPrimary, useT } from "./ui";

/** 이메일 인증 전인 회원에게 보이는 띠: 다시 보내기 */
export function VerifyBanner({ user, toast }: { user: User; toast: (m: string) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (user.verified !== false || user.test) return null;
  const resend = async () => {
    setBusy(true);
    const r = await api("/api/auth", "POST", { action: "resendVerify" });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setSent(true);
    toast(t("인증 메일을 다시 보냈어요. 메일함(스팸함 포함)을 확인해 주세요."));
  };
  return (
    <div data-block-id="C201" data-block-name="이메일 인증 안내" className="flex items-center justify-between gap-3 border-b border-[#F5D9A8] bg-[#FFF7E6] px-5 py-2.5 text-[13px] leading-snug text-[#7A4A00]">
      <span>
        <b>{t("이메일 인증이 필요해요.")}</b> {t("인증을 마치면 글쓰기와 카풀 신청을 할 수 있어요.")}
        <span className="block text-[12px] opacity-80">{user.email}</span>
      </span>
      <button data-block-id="B201" data-block-name="인증 메일 다시 보내기" disabled={busy} onClick={resend} className="min-h-0 shrink-0 rounded-lg border border-[#E9C27A] bg-white px-3 py-1.5 font-semibold disabled:opacity-50">
        {busy ? t("처리 중…") : sent ? t("다시 보내기") : t("인증 메일 받기")}
      </button>
    </div>
  );
}

/** 약관이 생기기 전에 가입한 회원: 다음 접속 때 한 번 동의를 받는다. */
export function ConsentSheet({ setUser, onClose, toast }: { setUser: (u: User) => void; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [agree, setAgree] = useState<Agree>({ terms: false, privacy: false, marketing: false });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "POST", { action: "consent", ...agree });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t("동의해 주셔서 고마워요."));
  };
  return (
    <Sheet title={t("약관 동의")} blockId="S201" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed text-sub">{t("모두의카풀 이용약관과 개인정보 처리방침이 새로 마련됐어요. 계속 이용하려면 동의해 주세요.")}</p>
        <Consent value={agree} onChange={setAgree} />
        <button data-block-id="B202" data-block-name="동의하고 계속" className={btnPrimary} disabled={busy || !agree.terms || !agree.privacy} onClick={submit}>{busy ? t("처리 중…") : t("동의하고 계속")}</button>
      </div>
    </Sheet>
  );
}

/** 약관 링크 (첫 화면·내 정보 하단) */
export function DocLinks() {
  const t = useT();
  return (
    <p className="mt-6 flex justify-center gap-4 text-[13px] text-sub">
      <a href="/terms" className="underline">{t("이용약관")}</a>
      <a href="/privacy" className="font-semibold underline">{t("개인정보 처리방침")}</a>
    </p>
  );
}
