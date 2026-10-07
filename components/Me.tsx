"use client";
import { useEffect, useState } from "react";
import { LANGS, type Lang } from "@/lib/i18n";
import { METER_URL, type Post, type User } from "@/lib/types";
import { Card, Icon, Segment, Tag, api, btnGhost, btnPrimary, field, useLang, useT, when } from "./ui";

export default function Me({
  user,
  enabled,
  setUser,
  setLang,
  onOpen,
  version,
  toast,
}: {
  user: User | null;
  enabled: boolean;
  setUser: (u: User | null) => void;
  setLang: (l: Lang) => void;
  onOpen: (p: Post) => void;
  version: number;
  toast: (m: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Post[]>([]);

  useEffect(() => {
    setName(user?.name ?? "");
    setBio(user?.bio ?? "");
    setContact(user?.contact ?? "");
  }, [user]);

  useEffect(() => {
    if (!user) return setMine([]);
    api<{ posts: Post[] }>("/api/posts?mine=1").then((r) => r.ok && setMine(r.data.posts));
  }, [user, version]);

  const auth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "POST", { action: mode, email, password, name });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setPassword("");
    setUser(r.data.user);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "PATCH", { name, bio, contact });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t("프로필을 저장했어요."));
  };

  return (
    <section data-block-id="S004" data-block-name="내 정보" className="space-y-5">
      <header>
        <h1 className="text-[28px] font-bold">{t("내 정보")}</h1>
      </header>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("언어")}</h2>
        <Segment label={t("언어")} value={lang} onChange={setLang} options={LANGS} />
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("계정")}</h2>
        <Card data-block-id="C040" data-block-name="계정" className="p-5">
          {user ? (
            <form onSubmit={saveProfile} className="space-y-3">
              <p className="break-all text-sm text-sub">{user.email}</p>
              <label className="block text-sm text-sub">
                {t("닉네임")}
                <input data-block-id="F040" className={`${field} mt-1`} required minLength={2} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-sm text-sub">
                {t("자기소개")}
                <textarea data-block-id="F041" className={`${field} mt-1`} rows={2} maxLength={200} placeholder={t("예: 판교로 출퇴근해요. 영어 조금 합니다.")} value={bio} onChange={(e) => setBio(e.target.value)} />
              </label>
              <label className="block text-sm text-sub">
                {t("연락 수단")}
                <input data-block-id="F042" className={`${field} mt-1`} maxLength={60} placeholder={t("예: 카카오톡 ID, 전화번호, LINE, WeChat")} value={contact} onChange={(e) => setContact(e.target.value)} />
              </label>
              <p className="text-[13px] text-sub">{t("연락 수단은 신청이 수락된 상대에게만 보입니다.")}</p>
              <button data-block-id="B040" data-block-name="프로필 저장" className={btnPrimary} disabled={busy}>{t("저장")}</button>
              <button type="button" data-block-id="B041" data-block-name="로그아웃" className={btnGhost} onClick={async () => { await api("/api/auth", "DELETE"); setUser(null); }}>{t("로그아웃")}</button>
            </form>
          ) : !enabled ? (
            <p className="text-[15px] leading-relaxed text-sub">{t("회원 기능은 준비 중입니다. 곧 열립니다.")}</p>
          ) : (
            <form onSubmit={auth} className="space-y-3">
              <Segment label={t("계정")} value={mode} onChange={setMode} options={[["login", t("로그인")], ["signup", t("회원가입")]]} />
              {mode === "signup" && (
                <label className="block text-sm text-sub">
                  {t("닉네임")}
                  <input className={`${field} mt-1`} required minLength={2} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
                </label>
              )}
              <label className="block text-sm text-sub">
                {t("이메일")}
                <input data-block-id="F043" className={`${field} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="block text-sm text-sub">
                {t("비밀번호 (8자 이상)")}
                <input data-block-id="F044" className={`${field} mt-1`} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button data-block-id="B042" data-block-name="로그인 제출" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : mode === "login" ? t("로그인") : t("가입하고 시작")}</button>
            </form>
          )}
        </Card>
      </div>

      {user && (
        <div>
          <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("내가 올린 카풀")}</h2>
          {mine.length === 0 ? (
            <Card className="px-6 py-8 text-center text-sub">{t("아직 올린 글이 없어요.")}</Card>
          ) : (
            <Card className="divide-y divide-line">
              {mine.map((p) => (
                <button key={p.id} onClick={() => onOpen(p)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.origin} → {p.dest}</p>
                    <p className="num text-[13px] text-sub">{when(p.departAt, lang)}</p>
                  </div>
                  <Tag tone={p.status === "open" ? "accent" : "plain"}>{p.status === "open" ? t("모집 중") : t("마감")}</Tag>
                </button>
              ))}
            </Card>
          )}
        </div>
      )}

      <Card data-block-id="C041" data-block-name="모카 미터기" className="p-5">
        <p className="text-sm font-medium text-accent">{t("모카 미터기")}</p>
        <p className="mt-1 text-lg font-semibold">{t("출퇴근 카풀 비용, 미터기로 깔끔하게")}</p>
        <p className="mt-1 text-[15px] text-sub">{t("GPS로 거리를 재고 택시 요율 기준 참고 금액을 인원수로 나눠 줍니다.")}</p>
        <a data-block-id="B043" data-block-name="미터기 열기" href={METER_URL} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-between rounded-2xl bg-accentSoft px-4 font-semibold text-accent">
          {t("모카 미터기 열기")} {Icon.arrow()}
        </a>
      </Card>

      <p className="px-1 text-[13px] leading-relaxed text-sub">
        {t("모두의카풀은 무료 운행을 원칙으로 하며, 출퇴근 카풀에 한해 실비 분담을 돕습니다. 영리 목적의 유상운송은 「여객자동차 운수사업법」에 따라 금지되어 있습니다. 만남과 이동에 대한 책임은 당사자에게 있으니 공개된 장소에서 만나 주세요.")}
      </p>
    </section>
  );
}
