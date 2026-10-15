"use client";
import { useState } from "react";
import { Sheet, api, btnGhost, btnPrimary, field, useT } from "./ui";

/** 설정 > 비밀번호 변경: 현재 비밀번호를 확인한 뒤 새 비밀번호로 바꾼다. */
export default function ChangePassword({ toast }: { toast: (m: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;

  const close = () => {
    setOpen(false);
    setCur("");
    setPw("");
    setPw2("");
  };

  return (
    <>
      <button type="button" data-block-id="B360" data-block-name="비밀번호 변경 열기" className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left font-semibold shadow-card" onClick={() => setOpen(true)}>
        {t("비밀번호 변경")}
      </button>
      {open && (
        <Sheet title={t("비밀번호 변경")} blockId="S360" onClose={close}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pw !== pw2) return toast(t("두 비밀번호가 같지 않아요."));
              setBusy(true);
              const r = await api("/api/auth", "POST", { action: "changePassword", current: cur, password: pw });
              setBusy(false);
              if (!r.ok) return toast(t(r.error));
              toast(t("비밀번호를 바꿨어요. 다른 기기의 로그인은 끊겼어요."));
              close();
            }}
          >
            <p className="text-[15px] leading-relaxed text-sub">{t("바꾸면 다른 기기의 로그인은 모두 끊기고, 이 기기는 그대로 로그인된 상태로 남아요.")}</p>
            <label className="block text-sm text-sub">
              {t("현재 비밀번호")}
              <input data-block-id="F360" className={`${field} mt-1`} type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
            </label>
            <label className="block text-sm text-sub">
              {t("새 비밀번호 (8자 이상)")}
              <input data-block-id="F361" className={`${field} mt-1`} type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label className="block text-sm text-sub">
              {t("새 비밀번호 확인")}
              <input data-block-id="F362" className={`${field} mt-1`} type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
            {mismatch && <p role="alert" className="text-[14px] text-warn">{t("두 비밀번호가 같지 않아요.")}</p>}
            <button data-block-id="B361" data-block-name="비밀번호 바꾸기" className={btnPrimary} disabled={busy || mismatch}>{busy ? t("처리 중…") : t("비밀번호 바꾸기")}</button>
            <button type="button" data-block-id="B362" data-block-name="비밀번호 변경 취소" className={btnGhost} onClick={close}>{t("취소")}</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
