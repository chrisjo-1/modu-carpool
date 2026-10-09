"use client";
import { useEffect, useRef, useState } from "react";
import { LANGS, type Lang } from "@/lib/i18n";
import { CONTACT_TYPES, METER_URL, type Post, type User } from "@/lib/types";
import AuthForm from "./AuthForm";
import CreditCard from "./Credits";
import { pushHint, type usePush } from "./Push";
import { Avatar, Card, Icon, Segment, Sheet, Tag, api, btnGhost, btnPrimary, field, scheduleText, useLang, useT } from "./ui";

/** 고른 사진을 가운데 정사각형으로 잘라 240px JPEG로 줄인다. */
/** 차량 사진: 긴 변 800px JPEG */
async function shrinkCar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  let q = 0.8;
  let out = canvas.toDataURL("image/jpeg", q);
  while (out.length > 290_000 && q > 0.4) out = canvas.toDataURL("image/jpeg", (q -= 0.1));
  return out;
}


/** 내 글이 다른 회원 목록에 보이지 않는 이유 */
export const HIDDEN_TEXT: Record<string, string> = {
  test: "테스트 회원으로 쓴 글이라 실제 회원에게는 보이지 않아요.",
  closed: "마감한 글이라 다른 회원 목록에 보이지 않아요.",
  expired: "출발 시각이 2시간 넘게 지나 목록에서 내려갔어요.",
  blocked: "이용이 정지된 계정이라 글이 보이지 않아요.",
};

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
}) {
  const t = useT();
  const lang = useLang();
  const [carNo, setCarNo] = useState("");
  const carFile = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [contact, setContact] = useState("");
  const [contactType, setContactType] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Post[]>([]);
  const [blocks, setBlocks] = useState<{ id: string; name: string; photo: string }[]>([]);
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

  const saveCarPhoto = async (photo: string) => {
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "PUT", { photo, kind: "car" });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t(photo ? "차량 사진을 등록했어요." : "차량 사진을 삭제했어요."));
  };
  const saveCarNo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ user: User }>("/api/auth", "PATCH", { carNo });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setUser(r.data.user);
    toast(t(r.data.user.carNo ? "차량번호를 저장했어요." : "차량번호를 지웠어요."));
  };

  useEffect(() => {
    setCarNo(user?.carNo ?? "");
    setName(user?.name ?? "");
    setBio(user?.bio ?? "");
    setContact(user?.contact ?? "");
    setContactType(user?.contactType ?? "");
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

      {user && <CreditCard toast={toast} version={version} />}

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
              <label data-block-id="F045" data-block-name="메일 알림" className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-line px-4 text-[15px]">
                <span>{t("메일 알림")}<span className="block text-[13px] text-sub">{t("카풀 신청, 수락, 첫 메시지를 가입 메일로 알려 드려요.")}</span></span>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#2F6BFF]" checked={user.notify !== false} onChange={async (e) => {
                  const r = await api<{ user: User }>("/api/auth", "PATCH", { notify: e.target.checked });
                  if (!r.ok) return toast(t(r.error));
                  setUser(r.data.user);
                  toast(t(r.data.user.notify ? "메일 알림을 켰어요." : "메일 알림을 껐어요."));
                }} />
              </label>
              <div data-block-id="F050" data-block-name="푸시 알림" className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-line px-4 py-2 text-[15px]">
                <span>{t("푸시 알림")}<span className="block text-[13px] text-sub">{pushHint[push.state] ? t(pushHint[push.state] as string) : t("카풀 신청과 채팅 메시지를 이 기기로 바로 알려 드려요.")}</span></span>
                <input type="checkbox" aria-label={t("푸시 알림")} className="h-5 w-5 shrink-0 accent-[#2F6BFF]" disabled={push.state !== "on" && push.state !== "off"} checked={push.state === "on"} onChange={async (e) => {
                  if (e.target.checked) {
                    const err = await push.turnOn();
                    toast(t(err || "푸시 알림을 켰어요."));
                  } else {
                    await push.turnOff();
                    toast(t("푸시 알림을 껐어요."));
                  }
                }} />
              </div>
              <button type="button" data-block-id="B041" data-block-name="로그아웃" className={btnGhost} onClick={async () => { await api("/api/auth", "DELETE"); setUser(null); }}>{t("로그아웃")}</button>
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

      <Card data-block-id="C041" data-block-name="모카 미터기" className="p-5">
        <p className="text-sm font-medium text-accent">{t("모카 미터기")}</p>
        <p className="mt-1 text-lg font-semibold">{t("출퇴근 카풀 비용, 미터기로 깔끔하게")}</p>
        <p className="mt-1 text-[15px] text-sub">{t("GPS로 거리를 재고 택시 요율 기준 참고 금액을 인원수로 나눠 줍니다.")}</p>
        <a data-block-id="B043" data-block-name="미터기 열기" href={METER_URL} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-between rounded-2xl bg-accentSoft px-4 font-semibold text-accent">
          {t("모카 미터기 열기")} {Icon.arrow()}
        </a>
      </Card>

      <a data-block-id="B048" data-block-name="관리자 페이지" href="/admin" className="flex items-center justify-between rounded-2xl border border-line bg-white px-5 text-[15px] text-sub">
        {t("관리자 페이지")} {Icon.arrow()}
      </a>

      <p className="px-1 text-[13px] leading-relaxed text-sub">
        {t("모두의카풀은 무료 운행을 원칙으로 하며, 출퇴근 카풀에 한해 실비 분담을 돕습니다. 영리 목적의 유상운송은 「여객자동차 운수사업법」에 따라 금지되어 있습니다. 만남과 이동에 대한 책임은 당사자에게 있으니 공개된 장소에서 만나 주세요.")}
      </p>
    </section>
  );
}
