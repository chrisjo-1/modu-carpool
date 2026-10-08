"use client";
import { useState } from "react";
import type { User } from "@/lib/types";
import { Sheet, api, btnPrimary, field, useT } from "./ui";

/** 메일의 재설정 링크(?reset=토큰)로 들어왔을 때 새 비밀번호를 정하는 창 */
export default function ResetSheet({ token, onClose, onDone, toast }: { token: string; onClose: () => void; onDone: (u: User) => void; toast: (m: string) => void }) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;

  return (
    <Sheet title={t("새 비밀번호 정하기")} blockId="S083" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw !== pw2) return toast(t("두 비밀번호가 같지 않아요."));
          setBusy(true);
          const r = await api<{ user: User }>("/api/auth", "POST", { action: "reset", token, password: pw });
          setBusy(false);
          if (!r.ok) return toast(t(r.error));
          onDone(r.data.user);
        }}
      >
        <p className="text-[15px] leading-relaxed text-sub">{t("새 비밀번호를 정하면 다른 기기의 로그인은 모두 끊기고, 이 기기에서 바로 로그인됩니다.")}</p>
        <label className="block text-sm text-sub">
          {t("새 비밀번호 (8자 이상)")}
          <input data-block-id="F083" className={`${field} mt-1`} type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="block text-sm text-sub">
          {t("새 비밀번호 확인")}
          <input data-block-id="F084" className={`${field} mt-1`} type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {mismatch && <p role="alert" className="text-[14px] text-warn">{t("두 비밀번호가 같지 않아요.")}</p>}
        <button data-block-id="B083" data-block-name="새 비밀번호 저장" className={btnPrimary} disabled={busy || mismatch}>{busy ? t("처리 중…") : t("비밀번호 바꾸기")}</button>
      </form>
    </Sheet>
  );
}
