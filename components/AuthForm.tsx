"use client";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import { creditText } from "./Credits";
import { pushHint, type usePush } from "./Push";
import { Segment, Sheet, api, btnPrimary, field, useLang, useT } from "./ui";

export const EMAIL_KEY = "modu.email";

export type Agree = { terms: boolean; privacy: boolean; marketing: boolean };

/** 약관 동의: 전체 동의 + 필수 2개 + 선택 마케팅. 가입 폼과 기존 회원 동의 창에서 함께 쓴다. */
export function Consent({ value, onChange }: { value: Agree; onChange: (v: Agree) => void }) {
  const t = useT();
  const all = value.terms && value.privacy && value.marketing;
  const row = (k: keyof Agree, label: string, href?: string, block = "") => (
    <div className="flex items-center justify-between gap-2">
      <label data-block-id={block} className="flex min-h-0 items-center gap-2 text-[14px]">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#2F6BFF]" checked={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.checked })} />
        <span>{label}</span>
      </label>
      {href && <a href={href} target="_blank" rel="noreferrer" className="shrink-0 text-[13px] text-sub underline">{t("보기")}</a>}
    </div>
  );
  return (
    <div data-block-id="C202" data-block-name="약관 동의" className="space-y-2 rounded-xl border border-line px-4 py-3">
      <label data-block-id="F201" className="flex min-h-0 items-center gap-2 border-b border-line pb-2 text-[15px] font-semibold">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#2F6BFF]" checked={all} onChange={(e) => onChange({ terms: e.target.checked, privacy: e.target.checked, marketing: e.target.checked })} />
        <span>{t("전체 동의")}</span>
      </label>
      {row("terms", t("[필수] 이용약관 동의"), "/terms", "F202")}
      {row("privacy", t("[필수] 개인정보 수집·이용 동의"), "/privacy", "F203")}
      {row("marketing", t("[선택] 이벤트·혜택 정보 수신"), undefined, "F204")}
    </div>
  );
}

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
  const [pending, setPending] = useState("");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [wantRegular, setWantRegular] = useState(false);
  // 가입 때는 알림을 따로 고르지 않는다: 메일·푸시 모두 켠 상태로 시작하고, 내 정보에서 바꿀 수 있다.
  const wantPush = true;
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const [legacyBonus, setLegacyBonus] = useState(0);
  const [agree, setAgree] = useState({ terms: false, privacy: false, marketing: false });
  useEffect(() => {
    api<{ rules?: { legacy?: number } }>("/api/credits").then((r) => r.ok && setLegacyBonus(r.data.rules?.legacy ?? 0));
  }, []);

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
    if (mode === "signup" && !(agree.terms && agree.privacy)) return toast(t("이용약관과 개인정보 수집·이용에 동의해 주세요."));
    setBusy(true);
    const r = await api<{ user: User; credit?: number; verify?: string }>("/api/auth", "POST", { action: mode, email, password, notify: mode === "signup" ? true : undefined, ...(mode === "signup" ? agree : {}) });
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
    // 가입은 이메일 인증을 마쳐야 완료된다. 인증 전에는 로그인시키지 않고 안내만 한다.
    if (mode === "signup") {
      setPending(email.trim());
      return toast(t("인증 메일을 보냈어요. 메일함에서 인증 링크를 눌러 가입을 마쳐 주세요."));
    }
    setUser(r.data.user);
    if (r.data.credit) toast(`${t("가입 축하 크레딧이 적립됐어요.")} +${creditText(r.data.credit, lang)}`);
    if (perm) {
      const err = await push.turnOn(perm);
      if (err) toast(t(err));
    }
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
        {mode === "signup" && legacyBonus > 0 && (
          <p data-block-id="C053" data-block-name="워프 회원 안내" className="rounded-xl bg-[#FFF7E6] px-4 py-3 text-[14px] leading-relaxed text-[#7A4A00]">
            <b>{t("구 워프 회원이셨나요?")}</b> {t("워프에 가입했던 이메일로 가입하면")} <b className="num">{creditText(legacyBonus, lang)}</b> {t("크레딧을 추가로 드려요.")}
          </p>
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
          {mode === "login" && canPush && check(wantPush, () => {}, t("푸시 알림 받기"), "F052", t("카풀 신청과 채팅 메시지를 이 기기로 바로 알려 드려요."))}
          {!canPush && mode === "login" && pushHint[push.state] && push.state !== "disabled" && <p className="text-[12px] text-sub">{t("푸시 알림")}: {t(pushHint[push.state] as string)}</p>}
          {check(remember, setRemember, t("이 기기에서 이메일 기억하기"), "F047")}
        </div>
        {mode === "signup" && <Consent value={agree} onChange={setAgree} />}
        {mode === "signup" && pending && <p data-block-id="C061" data-block-name="인증 메일 안내" role="status" className="rounded-xl bg-accentSoft px-4 py-3 text-[14px] leading-relaxed text-accent">{t("인증 메일을 보냈어요. 메일함에서 인증 링크를 눌러 가입을 마쳐 주세요.")}<br /><span className="font-semibold">{pending}</span></p>}
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
