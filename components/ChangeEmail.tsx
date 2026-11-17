"use client";
import { useState } from "react";
import { Sheet, api, btnGhost, btnPrimary, field, useT } from "./ui";

/**
 * 설정 > 로그인 메일 바꾸기(2026-11-17): 현재 비밀번호를 확인하고 새 주소로 확인 링크를 보낸다. 링크를 누르면 바뀐다.
 * 워프에서 애플 '메일 가리기'로 가입했거나 예전 메일을 잊은 회원이 평소 쓰는 메일로 옮길 때 쓴다.
 */
export default function ChangeEmail({ email, toast }: { email: string; toast: (m: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [cur, setCur] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const relay = /@privaterelay\.appleid\.com$/i.test(email);

  const close = () => {
    setOpen(false);
    setNext("");
    setCur("");
    setSent("");
  };

  return (
    <>
      <button type="button" data-block-id="B507" data-block-name="로그인 메일 바꾸기 열기" className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-card" onClick={() => setOpen(true)}>
        <span>
          <b>{t("로그인 메일 바꾸기")}</b>
          <span className="block break-all text-[13px] text-sub">{relay ? t("애플 '메일 가리기' 주소예요. 평소 쓰는 메일로 바꿔 주세요.") : email}</span>
        </span>
      </button>
      {open && (
        <Sheet title={t("로그인 메일 바꾸기")} blockId="S437" onClose={close}>
          {sent ? (
            <div className="space-y-4">
              <p className="text-[16px] leading-relaxed">{t("확인 메일을 보냈어요.")} <b className="break-all">{sent}</b></p>
              <p className="text-[15px] leading-relaxed text-sub">{t("메일의 [이 메일로 바꾸기]를 30분 안에 누르면 바뀌어요. 메일이 안 보이면 스팸함도 확인해 주세요.")}</p>
              <button type="button" className={btnPrimary} onClick={close}>{t("확인")}</button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const r = await api("/api/auth", "POST", { action: "changeEmail", email: next, current: cur });
                setBusy(false);
                if (!r.ok) return toast(t(r.error));
                setSent(next.trim().toLowerCase());
              }}
            >
              <p className="break-all text-[15px] leading-relaxed text-sub">{t("지금 메일")}: {email}</p>
              <label className="block text-sm text-sub">
                {t("새 메일 주소")}
                <input data-block-id="F449" className={`${field} mt-1`} type="email" autoComplete="email" required maxLength={120} value={next} onChange={(e) => setNext(e.target.value)} />
              </label>
              <label className="block text-sm text-sub">
                {t("현재 비밀번호")}
                <input data-block-id="F450" className={`${field} mt-1`} type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
              </label>
              <button data-block-id="B508" data-block-name="로그인 메일 확인 메일 보내기" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : t("확인 메일 보내기")}</button>
              <button type="button" className={btnGhost} onClick={close}>{t("취소")}</button>
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}
