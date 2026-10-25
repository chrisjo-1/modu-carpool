"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LANGS, type Lang } from "@/lib/i18n";
import { CONTACT_TYPES, HIDDEN_TEXT, METER_URL, SHOW_METER, defaultRoleFor, type Post, type User } from "@/lib/types";
import AuthForm from "./AuthForm";
import { NoticeList } from "./Notices";
import FeedbackSheet from "./Feedback";
import { HelpSheet } from "./Help";
import CreditCard from "./Credits";
import MyCallHistory from "./CallHistory";
import { KarrotRewards, KarrotShowcase } from "./Karrot";
import { pushHint, UnsupportedNotice, type usePush } from "./Push";
import RouteAlerts from "./RouteAlerts";
import { DocLinks } from "./Account";
import ChangePassword from "./ChangePassword";
const Withdraw = dynamic(() => import("./Withdraw"), { ssr: false });
import { Avatar, TierBadge, Card, Icon, Segment, Sheet, Tag, api, btnGhost, btnPrimary, field, scheduleText, useLang, useT } from "./ui";
import { shrinkCar } from "./CarInput";

/** 고른 사진을 가운데 정사각형으로 잘라 240px JPEG로 줄인다. */
/** 차량 사진: 긴 변 800px JPEG */


/** 내 글이 다른 회원 목록에 보이지 않는 이유 */

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
  onChanged,
  onEdit,
  push,
  onProfile,
  feedbackFirst = false,
  onCounsel,
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
  /** 차단을 풀어 글 목록을 다시 받아야 할 때 */
  onChanged: () => void;
  onEdit: (p: Post) => void;
  push: ReturnType<typeof usePush>;
  onProfile: (id: string) => void;
  /** 답변 알림을 눌러 들어온 경우 의견 창을 바로 연다 */
  feedbackFirst?: boolean;
  /** 마음 상담 창 열기 */
  onCounsel?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [carNo, setCarNo] = useState("");
  const carFile = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState("");
  const [contact, setContact] = useState("");
  const [contactType, setContactType] = useState("");
  const [gender, setGender] = useState("");
  const [rolePref, setRolePref] = useState("");
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(feedbackFirst);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Post[]>([]);
  const [mineOpen, setMineOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [blocks, setBlocks] = useState<{ id: string; name: string; photo: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const regular = mine.find((p) => p.regular) ?? null;

  const savePhoto = async (photo: string) => {
    // 삭제는 크레딧이 차감되므로 금액을 알리고 확인받는다. 변경(다른 사진으로 바꾸기)은 차감 없음.
    let amount = 0;
    if (!photo) {
      const c = await api<{ rules: { photo?: number } }>("/api/credits", "GET");
      amount = c.ok ? (c.data.rules.photo ?? 0) : 0;
      if (amount > 0 && !window.confirm(`${t("사진을 삭제하면 크레딧이 차감돼요.")} (-${amount.toLocaleString("ko-KR")}) ${t("계속할까요?")}`)) return;
    }
    setBusy(true);
    const r = await api<{ user: User; credit?: number }>("/api/auth", "PUT", { photo });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    if (photo && r.data.credit) return toast(`${t("사진을 등록했어요.")} ${t("프로필 사진 등록 축하 크레딧이 적립됐어요.")} +${r.data.credit.toLocaleString("ko-KR")}`);
    if (!photo && r.data.credit) return toast(`${t("사진을 삭제했어요.")} ${r.data.credit.toLocaleString("ko-KR")}`);
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

  const saveCarPhoto = async (photo: string) => {
    setBusy(true);
    const r = await api<{ user: User; credit?: number }>("/api/auth", "PUT", { photo, kind: "car" });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t(photo ? "차량 사진을 등록했어요." : "차량 사진을 삭제했어요.") + (r.data.credit ? ` ${t("차량 등록 축하 크레딧이 적립됐어요.")} +${r.data.credit.toLocaleString("ko-KR")}` : ""));
  };
  const saveCarNo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ user: User; credit?: number }>("/api/auth", "PATCH", { carNo });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t(r.data.user.carNo ? "차량번호를 저장했어요." : "차량번호를 지웠어요.") + (r.data.credit ? ` ${t("차량 등록 축하 크레딧이 적립됐어요.")} +${r.data.credit.toLocaleString("ko-KR")}` : ""));
  };

  useEffect(() => {
    setCarNo(user?.carNo ?? "");
    setBio(user?.bio ?? "");
    setContact(user?.contact ?? "");
    setContactType(user?.contactType ?? "");
    setGender(user?.gender ?? "");
    setRolePref(user?.rolePref || defaultRoleFor(user));
  }, [user]);

  useEffect(() => {
    if (!user) return setMine([]);
    api<{ posts: Post[] }>("/api/posts?mine=1").then((r) => r.ok && setMine(r.data.posts));
  }, [user, version]);

  const loadBlocks = () => api<{ blocks: { id: string; name: string; photo: string }[] }>("/api/blocks").then((r) => r.ok && setBlocks(r.data.blocks));
  useEffect(() => {
    if (!user) return setBlocks([]);
    loadBlocks();
  }, [user, version]);

  const unblock = async (id: string) => {
    const r = await api(`/api/blocks?u=${id}`, "DELETE");
    if (!r.ok) return toast(t(r.error));
    toast(t("차단을 풀었어요."));
    loadBlocks();
    onChanged();
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "PATCH", { bio, contact, contactType, gender, rolePref });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t("프로필을 저장했어요."));
  };

  return (
    <section data-block-id="S004" data-block-name="내 정보" className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold">{t("내 정보")}</h1>
        <button type="button" data-block-id="B070" data-block-name="설정 열기" aria-label={t("설정")} onClick={() => setSettingsOpen(true)} className="grid h-11 w-11 min-h-0 place-items-center rounded-full text-ink active:bg-bg">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
      </header>

      {zoom && user?.photo && (
        <div role="dialog" aria-label={t("프로필 사진")} data-block-id="C097" data-block-name="프로필 사진 확대" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.photo} alt="" className="max-h-[85vh] max-w-full rounded-2xl object-contain" />
          <button type="button" data-block-id="B293" className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-ink" onClick={() => setZoom(false)}>{t("닫기")}</button>
        </div>
      )}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t(user ? "마이 프로필" : "계정")}</h2>
        <Card data-block-id="C040" data-block-name="계정" className="p-5">
          {user ? (
            <form onSubmit={saveProfile} className="space-y-3">
              <div data-block-id="C042" data-block-name="프로필 사진" className="space-y-3">
                {!user.photo && (
                  <p data-block-id="C096" data-block-name="사진 등록 안내" className="rounded-xl bg-warnSoft px-4 py-3 text-[14px] leading-relaxed text-[#7C2D12]">
                    {t("카풀을 올리거나 신청·호출하려면 프로필 사진이 필요해요. 본인 사진이 원칙이며, AI로 바꾼 사진이나 얼굴이 나오지 않는 전신 사진도 가능해요.")}
                  </p>
                )}
                <div className="flex items-center gap-4">
                <button type="button" data-block-id="B294" data-block-name="프로필 사진 크게 보기" disabled={!user.photo} onClick={() => setZoom(true)} className="min-h-0 shrink-0 rounded-full disabled:cursor-default">
                  <Avatar src={user.photo} name={user.name} size={72} />
                </button>
                <div className="min-w-0 space-y-1">
                  <p className="break-all text-sm text-sub">{user.email}</p>
                  <div className="flex flex-wrap gap-x-4">
                    <button type="button" data-block-id="B044" data-block-name="사진 등록" disabled={busy} className="min-h-0 py-1 text-[15px] font-semibold text-accent" onClick={() => file.current?.click()}>{user.photo ? t("사진 변경") : t("사진 등록")}</button>
                    {user.photo && <button type="button" data-block-id="B045" data-block-name="사진 삭제" disabled={busy} className="min-h-0 py-1 text-[15px] text-sub underline" onClick={() => savePhoto("")}>{t("사진 삭제")}</button>}
                  </div>
                  <p data-block-id="C058" data-block-name="사진 안내" className="text-[13px] leading-relaxed text-sub">{t("본인 사진이 원칙이며, AI로 바꾼 사진이나 얼굴이 나오지 않는 전신 사진도 가능해요.")}</p>
                  <input ref={file} data-block-id="F046" type="file" accept="image/*" className="hidden" aria-label={t("프로필 사진")} onChange={pickPhoto} />
                </div>
                </div>
              </div>
              <div data-block-id="C057" data-block-name="운전자 등급" className="space-y-2 rounded-xl bg-bg px-4 py-3 text-[14px] leading-relaxed text-sub">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  {t("운전자 등급")}: {user.tier ? <TierBadge tier={user.tier} size="md" /> : t("미부여")}
                </p>
                {!user.tier && <p>{t("차량 번호와 차량 사진, 프로필 사진을 모두 등록하면 브론즈 등급이 자동으로 부여돼요.")}</p>}
                {user.tier && <p>{t("운전자로 글을 올리거나 신청하면 상대방에게 등급 배지가 보여요. 실버·골드는 운영팀이 지정해요.")}</p>}
                <p>{t("타인의 사진으로 신고되면 확인 후 이용이 정지될 수 있어요.")}</p>
              </div>
              <div data-block-id="C055" data-block-name="내 고유코드" className="space-y-1 text-sm text-sub">
                <span>{t("고유코드")}</span>
                <p className="rounded-xl bg-bg px-4 py-3 font-mono text-[16px] font-semibold tracking-wider text-ink">{user.memberCode || "-"}</p>
              </div>
              <label className="block text-sm text-sub">
                {t("자기소개")}
                <textarea data-block-id="F041" className={`${field} mt-1`} rows={2} maxLength={200} placeholder={t("예: 판교로 출퇴근해요. 영어 조금 합니다.")} value={bio} onChange={(e) => setBio(e.target.value)} />
              </label>
              <div className="space-y-1">
                <label htmlFor="F045" className="block text-sm text-sub">{t("연락 방법 (필수)")}</label>
                <select id="F045" data-block-id="F045" required className={field} value={contactType} onChange={(e) => setContactType(e.target.value)}>
                  <option value="">{t("선택")}</option>
                  {CONTACT_TYPES.map(([k, label]) => (
                    <option key={k} value={k}>{t(label)}</option>
                  ))}
                </select>
                <input data-block-id="F042" className={`${field} mt-2`} maxLength={60} required disabled={!contactType} aria-label={t("아이디 입력")} placeholder={t(contactType ? "아이디를 입력하세요" : "연락 방법을 먼저 선택하세요")} autoCapitalize="none" autoCorrect="off" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
              <p className="text-[13px] text-sub">{t("연락 수단은 신청이 수락된 상대에게만 보입니다.")}</p>
              <div className="flex gap-2">
                <label className="block w-1/2 text-sm text-sub">
                  {t("성별 (필수)")}
                  <select data-block-id="F053" required className={`${field} mt-1`} value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="" disabled>{t("선택해 주세요")}</option>
                    <option value="female">{t("여성")}</option>
                    <option value="male">{t("남성")}</option>
                  </select>
                </label>
                <label className="block w-1/2 text-sm text-sub">
                  {t("역할 (필수)")}
                  <select data-block-id="F054" required className={`${field} mt-1`} value={rolePref} onChange={(e) => setRolePref(e.target.value)}>
                    <option value="" disabled>{t("선택해 주세요")}</option>
                    <option value="driver">{t("운전자")}</option>
                    <option value="rider">{t("탑승자")}</option>
                  </select>
                </label>
              </div>
              <p className="text-[13px] text-sub">{t("운전과 탑승을 모두 하신다면 운전자를 선택해 주세요.")}</p>
              <p className="text-[13px] text-sub">{t("성별과 이용 역할은 공개되지 않고, 맞춤 공지를 보낼 때만 써요.")}</p>
              <button data-block-id="B040" data-block-name="프로필 저장" className={btnPrimary} disabled={busy}>{t("저장")}</button>
            </form>
          ) : !enabled ? (
            <p className="text-[15px] leading-relaxed text-sub">{t("회원 기능은 준비 중입니다. 곧 열립니다.")}</p>
          ) : (
            <AuthForm setUser={setUser} toast={toast} onCommute={() => onCommute(null, true)} push={push} />
          )}
        </Card>
      </div>
      {user && (
        <button data-block-id="B050" data-block-name="내 프로필" onClick={() => onProfile(user.id)} className="flex w-full items-center justify-between rounded-2xl border border-line bg-white px-5 text-left text-[16px] font-semibold shadow-card">
          {t("내 별점 · 지난 카풀 보기")} <span className="text-sub">{Icon.arrow()}</span>
        </button>
      )}
      {user && <CreditCard toast={toast} version={version} />}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("카풀 정보")}</h2>
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
          <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("내 차량 (운전자)")}</h2>
          <Card data-block-id="C047" data-block-name="내 차량" className="space-y-4 p-5">
            <div className="flex items-center gap-4">
              {user.carPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.carPhoto} alt={t("내 차량 사진")} className="h-20 w-28 shrink-0 rounded-xl border border-line object-cover" />
              ) : (
                <span className="grid h-20 w-28 shrink-0 place-items-center rounded-xl border border-dashed border-line text-sub">{Icon.car(1.4)}</span>
              )}
              <div className="flex flex-wrap gap-x-4">
                <button type="button" data-block-id="B055" data-block-name="차량 사진 등록" disabled={busy} className="min-h-0 py-1 text-[15px] font-semibold text-accent" onClick={() => carFile.current?.click()}>{user.carPhoto ? t("사진 변경") : t("차량 사진 등록")}</button>
                {user.carPhoto && <button type="button" data-block-id="B056" data-block-name="차량 사진 삭제" disabled={busy} className="min-h-0 py-1 text-[15px] text-sub underline" onClick={() => saveCarPhoto("")}>{t("사진 삭제")}</button>}
                <input ref={carFile} data-block-id="F048" type="file" accept="image/*" className="hidden" aria-label={t("차량 사진")} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    await saveCarPhoto(await shrinkCar(f));
                  } catch {
                    toast(t("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요."));
                  }
                }} />
              </div>
            </div>
            <form onSubmit={saveCarNo} className="flex gap-2">
              <input data-block-id="F049" className={field} maxLength={14} placeholder={t("차량번호 (예: 12가3456)")} aria-label={t("차량번호")} value={carNo} onChange={(e) => setCarNo(e.target.value)} />
              <button data-block-id="B057" data-block-name="차량번호 저장" disabled={busy || carNo.replace(/\s/g, "") === (user.carNo ?? "")} className="shrink-0 rounded-xl bg-accent px-5 font-semibold text-white disabled:opacity-40">{t("저장")}</button>
            </form>
            <p className="text-[13px] leading-relaxed text-sub">{t("차량 사진은 내 운전자 글과 프로필에 보이고, 차량번호는 신청을 수락한 상대에게만 보여요. 사진에는 번호판이 보이지 않게 찍어 주세요.")}</p>
          </Card>
        </div>
      )}
      {user && <KarrotShowcase toast={toast} />}
      {user && <KarrotRewards toast={toast} />}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("내 카풀")}</h2>
      </div>
      {user && (
        <div>
          <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("내가 올린 카풀")}</h2>
          {mine.length === 0 ? (
            <Card className="px-6 py-8 text-center text-sub">{t("아직 올린 글이 없어요.")}</Card>
          ) : (
            <div className="space-y-2">
              {/* 내역은 접어 두고, 버튼을 누르면 펼친다. */}
              <button type="button" data-block-id="B292" data-block-name="내가 올린 카풀 내역 보기" aria-expanded={mineOpen} aria-controls="my-posts" onClick={() => setMineOpen((v) => !v)} className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-[15px]">
                <span>{mineOpen ? t("내역 접기") : t("내역 보기")} <span className="num text-sub">({mine.length.toLocaleString("ko-KR")})</span></span>
                <span className={`text-sub transition-transform ${mineOpen ? "rotate-90" : ""}`}>{Icon.arrow()}</span>
              </button>
              {mineOpen && (
            <Card id="my-posts" className="divide-y divide-line">
              {mine.map((p) => (
                <div key={p.id} data-block-id="C045" data-block-name="내 글">
                <button onClick={() => onOpen(p)} className="flex w-full items-center justify-between gap-3 px-5 pb-1 pt-4 text-left">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.origin} → {p.dest}</p>
                    <p className="num text-[13px] text-sub">{p.regular ? `${t("정기카풀")} · ` : ""}{scheduleText(p, lang)}</p>
                  </div>
                  <Tag tone={p.status === "closed" ? "plain" : "accent"}>{p.status === "open" ? t("모집 중") : p.status === "progress" ? t("카풀 진행 중") : t("마감")}</Tag>
                </button>
                {p.hidden && <p data-block-id="C051" data-block-name="노출 안 됨 안내" className="mx-5 mb-2 rounded-lg bg-warnSoft px-3 py-2 text-[13px] text-warn">{t(HIDDEN_TEXT[p.hidden])}</p>}
                <div className="flex gap-4 px-5 pb-3 text-[14px]">
                  <button data-block-id="B051" data-block-name="글 수정" className="min-h-0 py-1 font-semibold text-accent underline" onClick={() => onEdit(p)}>{t("수정")}</button>
                  <button data-block-id="B052" data-block-name="글 삭제" className="min-h-0 py-1 text-warn underline" onClick={async () => {
                    if (!window.confirm(t("이 글을 삭제할까요?"))) return;
                    const r = await api(`/api/posts?id=${p.id}`, "DELETE");
                    toast(t(r.ok ? "삭제했어요." : r.error));
                    onChanged();
                  }}>{t("삭제")}</button>
                </div>
                </div>
              ))}
            </Card>
              )}
            </div>
          )}
        </div>
      )}
      {user && <RouteAlerts regular={regular} toast={toast} push={push} />}
      {user && <MyCallHistory />}
      {user && blocks.length > 0 && (
        <div>
          <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("차단한 회원")}</h2>
          <Card data-block-id="C044" data-block-name="차단한 회원" className="divide-y divide-line">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex min-w-0 items-center gap-3"><Avatar src={b.photo} name={b.name} size={36} /><span className="truncate font-semibold">{b.name}</span></span>
                <button data-block-id="B049" data-block-name="차단 해제" className="shrink-0 text-[14px] text-accent underline" onClick={() => unblock(b.id)}>{t("차단 해제")}</button>
              </div>
            ))}
          </Card>
        </div>
      )}
      {noticesOpen && <NoticeList onClose={() => setNoticesOpen(false)} />}
      {withdrawOpen && user && <Withdraw initialEmail={user.email} onClose={() => setWithdrawOpen(false)} />}
      {feedbackOpen && <FeedbackSheet loggedIn={!!user} toast={toast} onClose={() => setFeedbackOpen(false)} />}
      {helpOpen && <HelpSheet onClose={() => setHelpOpen(false)} onOpenFeedback={() => { setHelpOpen(false); setFeedbackOpen(true); }} />}
      {settingsOpen && (
        <Sheet title={t("설정")} blockId="S005" onClose={() => setSettingsOpen(false)}>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 px-1 text-sm font-semibold text-sub">{t("언어")}</h3>
              <Segment label={t("언어")} value={lang} onChange={setLang} options={LANGS} />
            </div>
            {user && (
              <div className="space-y-3">
                <h3 className="px-1 text-sm font-semibold text-sub">{t("알림")}</h3>
              <label data-block-id="F059" data-block-name="메일 알림" className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-line px-4 text-[15px]">
                <span>{t("메일 알림")}<span className="block text-[13px] text-sub">{t("카풀 신청, 수락, 첫 메시지를 가입 메일로 알려 드려요.")}</span></span>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#2F6BFF]" checked={user.notify !== false} onChange={async (e) => {
                  const r = await api<{ user: User }>("/api/auth", "PATCH", { notify: e.target.checked });
                  if (!r.ok) return toast(t(r.error));
                  setUser(r.data.user);
                  toast(t(r.data.user.notify ? "메일 알림을 켰어요." : "메일 알림을 껐어요."));
                }} />
              </label>
              <div data-block-id="F050" data-block-name="푸시 알림" className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-line px-4 py-2 text-[15px]">
                <span>{t("푸시 알림")}<span className="block text-[13px] text-sub">{pushHint[push.state] ? t(pushHint[push.state] as string) : push.state === "off" ? t("꺼 두어도 10일 넘게 접속하지 않으면 다시 켜져요.") : t("카풀 신청과 채팅 메시지를 이 기기로 바로 알려 드려요.")}</span></span>
                <input type="checkbox" aria-label={t("푸시 알림")} className="h-5 w-5 shrink-0 accent-[#2F6BFF]" disabled={push.state !== "on" && push.state !== "off"} checked={push.state === "on"} onChange={async (e) => {
                  if (e.target.checked) {
                    const err = await push.turnOn();
                    toast(t(err || "푸시 알림을 켰어요."));
                  } else {
                    await push.turnOff();
                    toast(t("알림을 잠시 껐어요. 10일 넘게 접속하지 않으면 다시 켜져요."));
                  }
                }} />
              </div>
              {push.state === "unsupported" && <UnsupportedNotice />}
              <label data-block-id="F208" data-block-name="마케팅 수신" className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-line px-4 text-[15px]">
                <span>{t("이벤트·혜택 정보 받기")}<span className="block text-[13px] text-sub">{t("선택 사항이에요. 언제든 끌 수 있어요.")}</span></span>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#2F6BFF]" checked={user.marketing === true} onChange={async (e) => {
                  const r = await api<{ user: User }>("/api/auth", "PATCH", { marketing: e.target.checked });
                  if (!r.ok) return toast(t(r.error));
                  setUser(r.data.user);
                  toast(t(r.data.user.marketing ? "이벤트·혜택 정보 수신에 동의했어요." : "이벤트·혜택 정보 수신을 철회했어요."));
                }} />
              </label>
              </div>
            )}
            {user && (
              <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold text-sub">{t("계정")}</h3>
              <ChangePassword toast={toast} />
              <button type="button" data-block-id="B069" data-block-name="탈퇴 신청 열기" className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-card" onClick={() => { setSettingsOpen(false); setWithdrawOpen(true); }}>
                <span><b>{t("탈퇴 신청")}</b><span className="block text-[13px] text-sub">{t("탈퇴하거나, 계속 이용하며 개인정보만 지울 수 있어요.")}</span></span>
                <span className="text-sub">{Icon.arrow()}</span>
              </button>
              </div>
            )}
            {user && (
              <div className="space-y-2">
              <button type="button" data-block-id="B041" data-block-name="로그아웃" className={btnGhost} onClick={async () => { await api("/api/auth", "DELETE"); setUser(null); }}>{t("로그아웃")}</button>
              </div>
            )}
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold text-sub">{t("안내")}</h3>
              {user && (
          <button data-block-id="B061" data-block-name="공지사항" className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left font-semibold shadow-card" onClick={() => { setSettingsOpen(false); setNoticesOpen(true); }}>
            {t("공지사항")} <span className="text-sub">{Icon.arrow()}</span>
          </button>
              )}
      <button data-block-id="B062" data-block-name="의견 보내기" className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-card" onClick={() => { setSettingsOpen(false); setFeedbackOpen(true); }}>
        <span><b>{t("의견 보내기")}</b><span className="block text-[13px] text-sub">{t("건의, 불편한 점, 아이디어를 들려주세요.")}</span></span>
        <span className="text-sub">{Icon.arrow()}</span>
      </button>
      <button data-block-id="B063" data-block-name="도움말 · 튜토리얼" className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-card" onClick={() => { setSettingsOpen(false); setHelpOpen(true); }}>
        <span><b>{t("도움말 · 튜토리얼")}</b><span className="block text-[13px] text-sub">{t("처음 쓰는 방법과 자주 묻는 질문")}</span></span>
        <span className="text-sub">{Icon.arrow()}</span>
      </button>
            </div>
            {/* 모카 미터기: 회원이 늘면 내 정보 화면으로 다시 꺼낸다. 지금은 설정 맨 아래 구석에 둔다. */}
            {SHOW_METER && (
              <a data-block-id="B043" data-block-name="미터기 열기" href={METER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-1 text-[13px] text-sub underline-offset-4 hover:underline">
                {t("모카 미터기 (카풀 비용 계산)")} <span aria-hidden>↗</span>
              </a>
            )}
            <div className="space-y-2">
      <a data-block-id="B048" data-block-name="관리자 페이지" href="/admin" className="flex items-center justify-between rounded-2xl border border-line bg-white px-5 text-[15px] text-sub">
        {t("관리자 페이지")} {Icon.arrow()}
      </a>
            </div>
            <div className="space-y-3 text-[13px] leading-relaxed text-sub">
      <p className="px-1 text-[13px] leading-relaxed text-sub">
        {t("모두의카풀은 무료 운행을 원칙으로 하며, 출퇴근 카풀에 한해 실비 분담을 돕습니다. 영리 목적의 유상운송은 「여객자동차 운수사업법」에 따라 금지되어 있습니다. 만남과 이동에 대한 책임은 당사자에게 있으니 공개된 장소에서 만나 주세요.")}
      </p>
      <DocLinks />
            </div>
            {/* 마음 상담: 설정 화면 맨 아래(사용자 지시). 앱 접속 팝업 링크 /?counsel=1 로도 열린다. */}
            {onCounsel && (
              <button type="button" data-block-id="B376" data-block-name="마음 상담 열기" onClick={() => { setSettingsOpen(false); onCounsel(); }} className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-left shadow-card">
                <span><b>{t("마음 상담")}</b><span className="block text-[13px] text-sub">{t("나의 스트레스 지수 체크 · 무료 상담 예약")}</span></span>
                <span className="text-sub">{Icon.arrow()}</span>
              </button>
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}
