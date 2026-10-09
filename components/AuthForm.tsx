"use client";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import { creditText } from "./Credits";
import { pushHint, type usePush } from "./Push";
import { Segment, Sheet, api, btnPrimary, field, useLang, useT } from "./ui";

export const EMAIL_KEY = "modu.email";

/** 로그인·회원가입 폼. 첫 화면과 내 정보에서 함께 쓴다. */
export default function AuthForm({
  setUser,
  toast,
  onCommute,
  push,
}: {
  setUser: (u: User | null) => void;
  toast: (m: string) => void;
  onCommute: (onboarding: true) => void;
  push: ReturnType<typeof usePush>;
}) {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const [wantRegular, setWantRegular] = useState(false);
  const [mail, setMail] = useState(true);
  const [wantPush, setWantPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sentMsg, setSentMsg] = useState("");

  // 이 기기에 기억한 이메일이 있으면 비밀번호만 입력하게 한다.
  useEffect(() => {
    try {
      const s = localStorage.getItem(EMAIL_KEY);
      if (s) {
        setSaved(s);
        setEmail(s);
      } else if (localStorage.getItem(EMAIL_KEY + ".off") === "1") setRemember(false);
    } catch {
      /* 무시 */
    }
  }, []);

  const canPush = push.state === "off";
  const usingSaved = mode === "login" && !!saved && email === saved;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 알림 권한 창은 버튼을 누른 그 순간에 띄워야 하는 브라우저가 있어 먼저 요청한다.
    const perm = canPush && wantPush && typeof Notification !== "undefined" ? Notification.requestPermission().catch(() => "default" as NotificationPermission) : null;
    setBusy(true);
    const r = await api<{ user: User; credit?: number }>("/api/auth", "POST", { action: mode, email, password, name, notify: mode === "signup" ? mail : undefined });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setPassword("");
    try {
      if (remember) {
        localStorage.setItem(EMAIL_KEY, email.trim());
        localStorage.removeItem(EMAIL_KEY + ".off");
      } else {
        localStorage.removeItem(EMAIL_KEY);
        localStorage.setItem(EMAIL_KEY + ".off", "1");
      }
    } catch {
      /* 무시 */
    }
    setUser(r.data.user);
    if (r.data.credit) toast(`${t("가입 축하 크레딧이 적립됐어요.")} +${creditText(r.data.credit, lang)}`);
    if (perm) {
      const err = await push.turnOn(perm);
      if (err) toast(t(err));
    }
    if (mode === "signup" && wantRegular) onCommute(true);
  };

  const check = (on: boolean, set: (v: boolean) => void, label: string, block: string, hint?: string) => (
    <label data-block-id={block} className="flex min-h-0 items-start gap-2 text-[14px]">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#2F6BFF]" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[12px] text-sub">{hint}</span>}
      </span>
    </label>
  );

  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        <Segment label={t("계정")} value={mode} onChange={setMode} options={[["login", t("로그인")], ["signup", t("회원가입")]]} />
        {mode === "signup" && (
          <label className="block text-sm text-sub">
            {t("닉네임")}
            <input className={`${field} mt-1`} required minLength={2} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {usingSaved ? (
          <div data-block-id="C052" data-block-name="기억한 이메일" className="flex items-center justify-between gap-3 rounded-xl bg-bg px-4 py-3">
            <span className="min-w-0 truncate font-semibold">{saved}</span>
            <button type="button" data-block-id="B059" data-block-name="다른 이메일" className="min-h-0 shrink-0 text-[14px] text-sub underline" onClick={() => setEmail("")}>{t("다른 이메일")}</button>
          </div>
        ) : (
          <label className="block text-sm text-sub">
            {t("이메일")}
            <input data-block-id="F043" className={`${field} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        <label className="block text-sm text-sub">
          {t("비밀번호 (8자 이상)")}
          <input data-block-id="F044" className={`${field} mt-1`} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required autoFocus={usingSaved} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {mode === "signup" && (
          <div className="space-y-1.5">
            <button type="button" data-block-id="B047" data-block-name="정기카풀 키워드" role="switch" aria-checked={wantRegular} onClick={() => setWantRegular((v) => !v)} className={`rounded-full border px-4 text-[15px] ${wantRegular ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
              {wantRegular ? "✓ " : "+ "}{t("정기카풀(출퇴근)")}
            </button>
            <p className="text-[13px] text-sub">{t("고르면 가입하자마자 출퇴근 정보를 입력해 정기카풀로 바로 등록됩니다.")}</p>
          </div>
        )}
        <div className="space-y-2 rounded-xl border border-line px-4 py-3">
          {mode === "signup" && check(mail, setMail, t("메일 알림 받기"), "F051", t("카풀 신청, 수락, 첫 메시지를 가입 메일로 알려 드려요."))}
          {canPush
            ? check(wantPush, setWantPush, t("푸시 알림 받기"), "F052", t("카풀 신청과 채팅 메시지를 이 기기로 바로 알려 드려요."))
            : pushHint[push.state] && push.state !== "disabled" && <p className="text-[12px] text-sub">{t("푸시 알림")}: {t(pushHint[push.state] as string)}</p>}
          {check(remember, setRemember, t("이 기기에서 이메일 기억하기"), "F047")}
        </div>
        <button data-block-id="B042" data-block-name="로그인 제출" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : mode === "login" ? t("로그인") : t("가입하고 시작")}</button>
        {mode === "login" && (
          <button type="button" data-block-id="B053" data-block-name="비밀번호 찾기" className="w-full min-h-0 py-2 text-[14px] text-sub underline" onClick={() => { setForgot(true); setSentMsg(""); }}>{t("비밀번호를 잊으셨나요?")}</button>
        )}
      </form>
      {forgot && (
        <Sheet title={t("비밀번호 찾기")} blockId="S082" onClose={() => setForgot(false)}>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await api<{ message: string }>("/api/auth", "POST", { action: "forgot", email });
              setBusy(false);
              if (!r.ok) return toast(t(r.error));
              setSentMsg(t(r.data.message));
            }}
          >
            <p className="text-[15px] leading-relaxed text-sub">{t("가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내 드려요. 링크는 30분 동안 쓸 수 있어요.")}</p>
            <label className="block text-sm text-sub">
              {t("이메일")}
              <input data-block-id="F046" className={`${field} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {sentMsg && <p role="status" data-block-id="C046" className="rounded-xl bg-accentSoft px-4 py-3 text-[15px] text-accent">{sentMsg}</p>}
            <button data-block-id="B054" data-block-name="재설정 메일 보내기" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : sentMsg ? t("다시 보내기") : t("재설정 메일 보내기")}</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
