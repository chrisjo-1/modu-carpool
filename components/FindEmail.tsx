"use client";
import { useState } from "react";
import { Sheet, api, btnGhost, btnPrimary, field, useT } from "./ui";

type Hit = { email: string; apple: boolean; passwordSet: boolean };

/**
 * 메일을 잊었어요(2026-11-17 사용자 지시): 워프 고유코드 또는 워프에 가입한 휴대폰 번호로 가입 메일을 가려서 보여 준다.
 * 둘 다 어렵거나 애플 '메일 가리기' 주소면 → 평소 쓰는 메일로 신규 가입 뒤 크레딧 이관 신청(닉네임·휴대폰 번호)으로 운영팀이 처리.
 */
export default function FindEmail({ onClose, onForgot, onSignup }: { onClose: () => void; onForgot: () => void; onSignup: () => void }) {
  const t = useT();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Hit[] | null>(null);

  return (
    <Sheet title={t("메일을 잊었어요")} blockId="S438" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          const r = await api<{ found: boolean; list: Hit[] }>("/api/auth", "POST", { action: "findEmail", key });
          setBusy(false);
          if (!r.ok) return setErr(t(r.error));
          setRes(r.data.list);
        }}
      >
        <p className="text-[15px] leading-relaxed text-sub">{t("워프 회원이셨다면 워프 고유코드나 워프에 가입한 휴대폰 번호로 가입 메일을 찾아 드려요.")}</p>
        <label className="block text-sm text-sub">
          {t("워프 고유코드 또는 휴대폰 번호")}
          <input data-block-id="F451" className={`${field} mt-1`} required maxLength={20} placeholder={t("예: 1234567A 또는 01012345678")} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        {err && <p role="alert" className="text-[14px] text-warn">{err}</p>}
        <button data-block-id="B510" data-block-name="가입 메일 찾기" className={btnPrimary} disabled={busy}>{busy ? t("찾는 중…") : t("가입 메일 찾기")}</button>
      </form>

      {res && (
        <div data-block-id="C452" data-block-name="찾은 가입 메일" className="mt-4 space-y-2">
          {res.length === 0 && <p className="rounded-xl bg-bg px-4 py-3 text-[15px]">{t("일치하는 워프 회원을 찾지 못했어요.")}</p>}
          {res.map((h) => (
            <div key={h.email} className="space-y-1 rounded-xl border border-line px-4 py-3">
              <p className="break-all text-[16px] font-bold">{h.email}</p>
              {h.apple ? (
                <p className="text-[14px] leading-relaxed text-warn">
                  {t("애플 '메일 가리기' 주소예요. 이 주소로는 메일이 가지 않아요.")}
                  {h.passwordSet ? ` ${t("비밀번호를 정해 두셨다면 워프 고유코드로 로그인할 수 있어요.")}` : ` ${t("아래 신규 가입으로 진행해 주세요.")}`}
                </p>
              ) : h.passwordSet ? (
                <p className="text-[14px] text-sub">{t("이 메일로 로그인하세요. 비밀번호가 기억나지 않으면 비밀번호 찾기를 눌러 주세요.")}</p>
              ) : (
                <p className="text-[14px] text-sub">{t("아직 비밀번호를 정하지 않았어요. 비밀번호 찾기에 이 메일 전체를 적으면 비밀번호를 정하는 메일이 가요.")}</p>
              )}
            </div>
          ))}
          {res.some((h) => !h.apple) && (
            <button type="button" data-block-id="B511" data-block-name="찾은 메일로 비밀번호 찾기" className={btnGhost} onClick={onForgot}>{t("비밀번호 찾기")}</button>
          )}
        </div>
      )}

      <div className="mt-5 space-y-2 rounded-xl bg-accentSoft px-4 py-3">
        <p className="text-[15px] font-semibold">{t("메일도 고유코드도 어렵다면")}</p>
        <p className="text-[14px] leading-relaxed text-ink">{t("평소 쓰는 메일로 새로 가입한 뒤, 내 정보 › 의견 보내기 › 크레딧 이관에 워프 닉네임과 워프에 가입한 휴대폰 번호를 적어 신청해 주세요. 운영팀이 확인해 워프 크레딧을 옮겨 드려요.")}</p>
        <button type="button" data-block-id="B512" data-block-name="새 메일로 신규 가입" className={btnPrimary} onClick={onSignup}>{t("신규 가입하기")}</button>
      </div>
    </Sheet>
  );
}
