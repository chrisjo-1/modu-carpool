"use client";
import type { Lang } from "@/lib/i18n";
import { LANGS } from "@/lib/i18n";
import type { User } from "@/lib/types";
import AuthForm from "./AuthForm";
import type { usePush } from "./Push";
import { Card, Icon, useLang, useT } from "./ui";

/** 로그인하지 않은 방문자의 첫 화면: 로그인·회원가입, 또는 미리 둘러보기 */
export default function Gate({
  setUser,
  toast,
  onCommute,
  push,
  onPreview,
  setLang,
  sharedPost,
}: {
  setUser: (u: User | null) => void;
  toast: (m: string) => void;
  onCommute: (onboarding: true) => void;
  push: ReturnType<typeof usePush>;
  onPreview: () => void;
  setLang: (l: Lang) => void;
  sharedPost: string;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <div data-block-id="S005" data-block-name="첫 화면" className="fixed inset-0 z-[55] overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white">{Icon.car(1.8)}</span>
            <span className="text-xl font-bold">{t("모두의카풀")}</span>
          </span>
          <select aria-label={t("언어")} className="rounded-lg border border-line bg-white px-2 py-1.5 text-[14px]" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <h1 className="mt-8 text-[28px] font-bold leading-tight">{t("같은 방향, 같이 가요")}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-sub">{sharedPost ? t("공유받은 카풀을 보려면 로그인하거나 둘러보기를 눌러 주세요.") : t("출퇴근길도 나들이도, 방향이 같은 사람과 함께 타요.")}</p>
        <Card className="mt-6 p-5">
          <AuthForm setUser={setUser} toast={toast} onCommute={onCommute} push={push} />
        </Card>
        <button data-block-id="B060" data-block-name="미리 둘러보기" className="mt-4 w-full rounded-2xl border border-line bg-white py-3.5 text-[16px] font-semibold text-ink" onClick={onPreview}>
          {t("로그인 없이 미리 둘러보기")}
        </button>
        <p className="mt-2 text-center text-[13px] text-sub">{t("둘러보다가 신청하거나 글을 쓸 때 로그인하면 돼요.")}</p>
      </div>
    </div>
  );
}
