"use client";
import { useEffect, useRef, useState } from "react";
import { METER_URL, contactLabel, type Thread, type User } from "@/lib/types";
import { Stars } from "./Member";
import type { usePush } from "./Push";
import { Avatar, Card, Icon, Sheet, Tag, api, btnPrimary, field, money, scheduleText, useLang, useT } from "./ui";

type Msg = { id: number; mine: boolean; body: string; image?: string; at: number };

/** 채팅 사진: 긴 변 1280px JPEG로 줄인다. */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
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
  let q = 0.82;
  let out = canvas.toDataURL("image/jpeg", q);
  while (out.length > 800_000 && q > 0.4) out = canvas.toDataURL("image/jpeg", (q -= 0.12));
  return out;
}

/** 목록에 보일 마지막 메시지 시각: 오늘이면 시:분, 아니면 월/일 */
function shortTime(ms: number, lang: string) {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString(lang === "ko" ? "ko-KR" : lang, today ? { hour: "2-digit", minute: "2-digit", hour12: false } : { month: "numeric", day: "numeric" });
}

export default function Chat({ user, enabled, threads, goLogin, openChat, push, toast }: { user: User | null; enabled: boolean; threads: Thread[]; goLogin: () => void; openChat: (th: Thread) => void; push: ReturnType<typeof usePush>; toast: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const statusText = { pending: t("수락 대기 중"), accepted: t("수락됨"), declined: t("거절됨") };

  return (
    <section data-block-id="S003" data-block-name="채팅" className="space-y-4">
      <header>
        <h1 className="text-[28px] font-bold">{t("채팅")}</h1>
        <p className="mt-1 text-sub">{t("신청이 수락되면 여기서 대화할 수 있어요.")}</p>
      </header>
      {user && push.state === "off" && (
        <Card data-block-id="C037" data-block-name="푸시 알림 안내" className="flex items-center justify-between gap-3 px-5 py-4">
          <p className="text-[14px] leading-relaxed">{t("푸시 알림을 켜면 카풀 신청과 메시지를 바로 받을 수 있어요.")}</p>
          <button data-block-id="B035" data-block-name="푸시 켜기" className="shrink-0 rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white" onClick={async () => { const err = await push.turnOn(); toast(t(err || "푸시 알림을 켰어요.")); }}>{t("켜기")}</button>
        </Card>
      )}
      {!user ? (
        <Card className="space-y-4 p-6 text-center">
          <p className="text-sub">{enabled ? t("로그인하면 신청 내역과 대화를 볼 수 있어요.") : t("회원 기능은 준비 중입니다. 곧 열립니다.")}</p>
          {enabled && <button className={btnPrimary} onClick={goLogin}>{t("로그인 / 회원가입")}</button>}
        </Card>
      ) : threads.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sub">{t("아직 신청 내역이 없어요.")}</Card>
      ) : (
        <Card className="divide-y divide-line">
          {threads.map((th) => (
            <button key={th.id} data-block-id="C030" data-block-name="대화 항목" disabled={th.status !== "accepted"} onClick={() => openChat(th)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left disabled:opacity-70">
              <Avatar src={th.otherPhoto} name={th.other} size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{th.other} <span className="font-normal text-sub">· {th.origin} → {th.dest}</span></span>
                  {th.last && <span className="num shrink-0 text-[12px] text-sub">{shortTime(th.last.at, lang)}</span>}
                </p>
                {th.last ? (
                  <p data-block-id="C032" data-block-name="마지막 메시지" className={`truncate text-[14px] ${th.unread ? "font-semibold text-ink" : "text-sub"}`}>
                    {th.last.mine && <span className="text-sub">{t("나")}: </span>}
                    {th.last.image ? `[${t("사진")}]` : th.last.text}
                  </p>
                ) : (
                  <p className="num truncate text-[13px] text-sub">{scheduleText(th, lang)} · {th.iAmOwner ? t("받은 신청") : t("보낸 신청")}</p>
                )}
              </div>
              {th.unread ? (
                <span data-block-id="C033" data-block-name="안 읽은 메시지 수" aria-label={`${t("안 읽은 메시지")} ${th.unread}`} className="num grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-warn px-1.5 text-[12px] font-bold text-white">{th.unread > 99 ? "99+" : th.unread}</span>
              ) : (
                <Tag tone={th.status === "accepted" ? "accent" : "plain"}>{statusText[th.status]}</Tag>
              )}
            </button>
          ))}
        </Card>
      )}
    </section>
  );
}

export function ChatRoom({
  thread,
  onClose,
  toast,
  onChanged,
  onProfile,
  onReport,
  onBlock,
}: {
  thread: Thread;
  onClose: () => void;
  toast: (m: string) => void;
  onChanged: () => void;
  onProfile: (id: string) => void;
  onReport: (id: string, name: string, requestId: string) => void;
  onBlock: (id: string, name: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(thread.myStars ?? 0);
  const [otherUnread, setOtherUnread] = useState(0);
  const [nudgedAt, setNudgedAt] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const count = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api<{ messages: Msg[]; otherUnread: number; nudgedAt: number | null }>(`/api/messages?request=${thread.id}`);
      if (alive && r.ok) {
        setMsgs(r.data.messages);
        setOtherUnread(r.data.otherUnread ?? 0);
        setNudgedAt(r.data.nudgedAt ?? null);
      }
    };
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [thread.id]);

  useEffect(() => {
    if (msgs.length !== count.current) end.current?.scrollIntoView({ block: "end" });
    count.current = msgs.length;
  }, [msgs]);

  const rate = async (n: number) => {
    const before = stars;
    setStars(n);
    const r = await api("/api/reviews", "POST", { requestId: thread.id, stars: n });
    if (!r.ok) {
      setStars(before);
      return toast(t(r.error));
    }
    toast(t("별점을 남겼어요."));
    onChanged();
  };

  const sendPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast(t("사진 파일만 보낼 수 있어요."));
    setBusy(true);
    try {
      const image = await shrinkPhoto(file);
      const r = await api<{ id: number }>("/api/messages", "POST", { requestId: thread.id, body: "", image });
      if (!r.ok) return toast(t(r.error));
      setMsgs((m) => [...m, { id: r.data.id, mine: true, body: "", image, at: Date.now() }]);
    } catch {
      toast(t("사진을 불러오지 못했어요."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const nudge = async () => {
    setBusy(true);
    const r = await api("/api/messages", "PUT", { requestId: thread.id });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setNudgedAt(Date.now());
    toast(t("상대에게 메일로 알렸어요."));
  };
  const nudgeLocked = nudgedAt != null && Date.now() - nudgedAt < 6 * 3600_000;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    const r = await api("/api/messages", "POST", { requestId: thread.id, body });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setText("");
    setMsgs((m) => [...m, { id: Date.now(), mine: true, body, at: Date.now() }]);
  };

  return (
    <Sheet title={`${thread.other} · ${thread.origin} → ${thread.dest}`} blockId="S030" onClose={onClose}>
      <div className="space-y-3">
        {thread.otherId && (
          <div className="flex items-center justify-between gap-3">
            <button data-block-id="B032" data-block-name="상대 프로필" className="flex min-h-0 min-w-0 items-center gap-2 font-semibold" onClick={() => onProfile(thread.otherId as string)}>
              <Avatar src={thread.otherPhoto} name={thread.other} size={36} />
              <span className="truncate underline decoration-line underline-offset-4">{thread.other}</span>
            </button>
            <span className="flex shrink-0 gap-3 text-[14px]">
              <button data-block-id="B033" data-block-name="신고하기" className="min-h-0 py-2 text-warn underline" onClick={() => onReport(thread.otherId as string, thread.other, thread.id)}>{t("신고하기")}</button>
              <button data-block-id="B031" data-block-name="회원 차단" className="min-h-0 py-2 text-sub underline" onClick={() => onBlock(thread.otherId as string, thread.other)}>{t("차단")}</button>
            </span>
          </div>
        )}
        <div className="space-y-2 rounded-2xl bg-bg p-4 text-[14px]">
          {(thread.otherCarNo || thread.otherCarPhoto) && (
            <div data-block-id="C036" data-block-name="상대 차량" className="flex items-center gap-3">
              {thread.otherCarPhoto && (
                <a href={thread.otherCarPhoto} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thread.otherCarPhoto} alt={t("상대 차량 사진")} className="h-12 w-16 rounded-lg border border-line object-cover" />
                </a>
              )}
              <p><span className="text-sub">{t("차량번호")}: </span><b className="num">{thread.otherCarNo || t("미등록")}</b></p>
            </div>
          )}
          <p><span className="text-sub">{t("상대 연락 수단")}: </span><b className="break-all">{thread.contact ? `${thread.contactType ? `${t(contactLabel(thread.contactType))} · ` : ""}${thread.contact}` : t("등록된 연락 수단이 없어요.")}</b></p>
          {thread.cost === "fixed" && <p><span className="text-sub">{t("1인 금액")}: </span><b className="num">{money(thread.price ?? 0, lang)}</b></p>}
          {thread.cost === "meter" && (
            <a href={METER_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-0 items-center gap-1 font-semibold text-accent">{t("모카 미터기로 비용 나누기")} {Icon.arrow()}</a>
          )}
        </div>
        <div className="min-h-[30dvh] space-y-2" aria-live="polite">
          {msgs.length === 0 && <p className="py-8 text-center text-[15px] text-sub">{t("첫 인사를 건네 보세요.")}</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              {m.image ? (
                <a href={m.image} target="_blank" rel="noopener noreferrer" className="block max-w-[70%] overflow-hidden rounded-2xl border border-line bg-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-block-id="C034" src={m.image} alt={t("보낸 사진")} loading="lazy" className="block max-h-72 w-auto object-cover" />
                </a>
              ) : (
                <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] ${m.mine ? "bg-accent text-white" : "bg-bg text-ink"}`}>{m.body}</p>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        {otherUnread > 0 && msgs.length > 0 && (
          <div data-block-id="C038" data-block-name="메일로 알리기" className="flex items-center justify-between gap-3 rounded-2xl bg-bg px-4 py-2.5">
            <span className="text-[13px] text-sub">{t("상대가 아직 읽지 않은 메시지")} <b className="num text-ink">{otherUnread}</b></span>
            <button data-block-id="B036" data-block-name="메일로 알리기" disabled={busy || nudgeLocked} className="min-h-0 shrink-0 rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-accent disabled:text-sub" onClick={nudge}>
              {nudgeLocked ? t("메일 알림 보냄") : t("메일로 알리기")}
            </button>
          </div>
        )}
        {thread.canRate && (
          <div data-block-id="C031" data-block-name="별점 남기기" className="flex items-center justify-between rounded-2xl border border-line px-4 py-2">
            <span className="text-[14px] text-sub">{stars ? t("내가 남긴 별점") : t("카풀은 어땠나요? 별점을 남겨 주세요.")}</span>
            <Stars value={stars} onChange={rate} size={24} />
          </div>
        )}
        <form onSubmit={send} className="sticky bottom-0 flex gap-2 bg-surface pt-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => sendPhoto(e.target.files?.[0])} />
          <button type="button" data-block-id="B034" data-block-name="사진 보내기" aria-label={t("사진 보내기")} disabled={busy} className="grid shrink-0 place-items-center rounded-xl border border-line px-3 text-sub disabled:opacity-40" onClick={() => fileRef.current?.click()}>{Icon.image(1.6)}</button>
          <input data-block-id="F030" className={field} maxLength={500} placeholder={t("메시지 입력")} aria-label={t("메시지 입력")} value={text} onChange={(e) => setText(e.target.value)} />
          <button data-block-id="B030" data-block-name="전송" disabled={busy || !text.trim()} className="shrink-0 rounded-xl bg-accent px-5 font-semibold text-white disabled:opacity-40">{t("전송")}</button>
        </form>
      </div>
    </Sheet>
  );
}
