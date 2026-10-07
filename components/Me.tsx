"use client";
import { useEffect, useRef, useState } from "react";
import { LANGS, type Lang } from "@/lib/i18n";
import { CONTACT_TYPES, METER_URL, type Post, type User } from "@/lib/types";
import { Avatar, Card, Icon, Segment, Tag, api, btnGhost, btnPrimary, field, scheduleText, useLang, useT } from "./ui";

/** 고른 사진을 가운데 정사각형으로 잘라 240px JPEG로 줄인다. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 240, 240);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 240, 240);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function Me({
  user,
  enabled,
  setUser,
  setLang,
  onOpen,
  version,
  toast,
  onCommute,
}: {
  user: User | null;
  enabled: boolean;
  setUser: (u: User | null) => void;
  setLang: (l: Lang) => void;
  onOpen: (p: Post) => void;
  version: number;
  toast: (m: string) => void;
  /** 출퇴근 정보 입력 창을 연다. 가입 직후면 onboarding 이 true. */
  onCommute: (post: Post | null, onboarding: boolean) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [contact, setContact] = useState("");
  const [contactType, setContactType] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Post[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const regular = mine.find((p) => p.regular) ?? null;

  const savePhoto = async (photo: string) => {
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "PUT", { photo });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t(photo ? "사진을 등록했어요." : "사진을 삭제했어요."));
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      await savePhoto(await shrink(f));
    } catch {
      toast(t("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요."));
    }
  };

  useEffect(() => {
    setName(user?.name ?? "");
    setBio(user?.bio ?? "");
    setContact(user?.contact ?? "");
    setContactType(user?.contactType ?? "");
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
    // 가입 직후에는 출퇴근 정보를 바로 받는다.
    if (mode === "signup") onCommute(null, true);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "PATCH", { name, bio, contact, contactType });
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
              <div data-block-id="C042" data-block-name="프로필 사진" className="flex items-center gap-4">
                <Avatar src={user.photo} name={user.name} size={72} />
                <div className="min-w-0 space-y-1">
                  <p className="break-all text-sm text-sub">{user.email}</p>
                  <div className="flex flex-wrap gap-x-4">
                    <button type="button" data-block-id="B044" data-block-name="사진 등록" disabled={busy} className="min-h-0 py-1 text-[15px] font-semibold text-accent" onClick={() => file.current?.click()}>{user.photo ? t("사진 변경") : t("사진 등록")}</button>
                    {user.photo && <button type="button" data-block-id="B045" data-block-name="사진 삭제" disabled={busy} className="min-h-0 py-1 text-[15px] text-sub underline" onClick={() => savePhoto("")}>{t("사진 삭제")}</button>}
                  </div>
                  <input ref={file} data-block-id="F046" type="file" accept="image/*" className="hidden" aria-label={t("프로필 사진")} onChange={pickPhoto} />
                </div>
              </div>
              <label className="block text-sm text-sub">
                {t("닉네임")}
                <input data-block-id="F040" className={`${field} mt-1`} required minLength={2} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-sm text-sub">
                {t("자기소개")}
                <textarea data-block-id="F041" className={`${field} mt-1`} rows={2} maxLength={200} placeholder={t("예: 판교로 출퇴근해요. 영어 조금 합니다.")} value={bio} onChange={(e) => setBio(e.target.value)} />
              </label>
              <div className="space-y-1">
                <label htmlFor="F045" className="block text-sm text-sub">{t("연락 방법")}</label>
                <div className="flex gap-2">
                  <select id="F045" data-block-id="F045" className={`${field} w-[46%] shrink-0`} value={contactType} onChange={(e) => setContactType(e.target.value)}>
                    <option value="">{t("선택")}</option>
                    {CONTACT_TYPES.map(([k, label]) => (
                      <option key={k} value={k}>{t(label)}</option>
                    ))}
                  </select>
                  <input data-block-id="F042" className={field} maxLength={60} aria-label={t("연락처 입력")} placeholder={t(contactType === "phone" ? "예: 010-1234-5678" : "ID 또는 번호")} inputMode={contactType === "phone" ? "tel" : "text"} value={contact} onChange={(e) => setContact(e.target.value)} />
                </div>
              </div>
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
          <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("내 출퇴근 정보")}</h2>
          <Card data-block-id="C043" data-block-name="내 출퇴근 정보" className="space-y-3 p-5">
            {regular ? (
              <div>
                <p className="font-semibold">{regular.origin} → {regular.dest}</p>
                <p className="num text-[14px] text-sub">{scheduleText(regular, lang)}</p>
              </div>
            ) : (
              <p className="text-[15px] text-sub">{t("아직 출퇴근 정보를 입력하지 않았어요.")}</p>
            )}
            <button type="button" data-block-id="B046" data-block-name="출퇴근 정보" className={`${btnGhost} py-3 text-[15px]`} onClick={() => onCommute(regular, false)}>{regular ? t("출퇴근 정보 수정") : t("출퇴근 정보 입력")}</button>
          </Card>
        </div>
      )}

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
                    <p className="num text-[13px] text-sub">{p.regular ? `${t("정기카풀")} · ` : ""}{scheduleText(p, lang)}</p>
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
