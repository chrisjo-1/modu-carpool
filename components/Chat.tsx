"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { METER_URL, SHOW_METER, contactLabel, type Thread, type User } from "@/lib/types";
import { Stars } from "./Member";
import { Route } from "./Home";
import type { usePush } from "./Push";
import { RoleTag, Avatar, TierBadge, Card, Icon, Sheet, Tag, api, btnPrimary, field, money, scheduleText, useLang, useT } from "./ui";

type Msg = { id: number; mine: boolean; body: string; image?: string; at: number };

const ContractSheet = dynamic(() => import("./Contract"), { ssr: false });

const MANNER_KEY = "modu.chat.manners"; // 매너 안내를 한 번 본 기기(localStorage)
const MANNERS = [
  "서로 존중하는 말투로 대화해요. 욕설·비하·성희롱은 금지예요.",
  "카풀 비용은 기름값·통행료 같은 실비 범위에서 나눠요.",
  "약속 시간을 지키고, 늦거나 취소할 땐 미리 알려 주세요.",
  "주소·전화번호 같은 개인정보는 꼭 필요한 만큼만 나눠요.",
  "돈을 먼저 보내 달라는 요구나 다른 곳 거래 유도는 금지예요.",
  "불편한 일이 생기면 바로 신고해 주세요.",
];

/**
 * 대화방 위 '카풀 대화 매너' 안내(2026-10-30 사용자 지시). 이 기기에서 처음 열 때는 펼치고, 다음부터 한 줄로 접어 둔다.
 * 문구는 처리방침 '채팅 확인:'과 맞춘다(운영팀 수시 확인·열람 기록). 관리자 '채팅' 탭에서 최근 대화를 실제로 점검한다.
 */
function ChatManners() {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(MANNER_KEY)) {
        setOpen(true);
        localStorage.setItem(MANNER_KEY, "1");
      }
    } catch {
      /* 무시 */
    }
  }, []);
  return (
    <div data-block-id="C410" data-block-name="카풀 대화 매너" className="rounded-2xl border border-line bg-bg px-4 py-3 text-[13px] leading-relaxed text-sub">
      <button type="button" data-block-id="B417" data-block-name="대화 매너 펼치기" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-0 w-full items-center justify-between gap-2 text-left">
        <span><b className="text-ink">{t("카풀 대화 매너")}</b> · {t("안전과 매너를 위해 운영팀이 대화를 수시로 확인하고 있어요.")}</span>
        <span className={`shrink-0 motion-safe:transition-transform ${open ? "rotate-90" : ""}`}>{Icon.arrow()}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <ul className="space-y-1 text-ink">
            {MANNERS.map((m) => (
              <li key={m}>· {t(m)}</li>
            ))}
          </ul>
          <p className="font-semibold text-warn">{t("모든 대화는 기록돼요. 매너를 지키지 않으면 이용이 제한될 수 있어요.")}</p>
        </div>
      )}
    </div>
  );
}

const LOCALE: Record<string, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };
const kst = (ms: number) => new Date(ms + 9 * 3600000).toISOString();
const dayKey = (ms: number) => kst(ms).slice(0, 10);
const minuteKey = (ms: number) => kst(ms).slice(0, 16);
/** 보낸 시각: 오후 3:05 */
const clock = (ms: number, lang: string) => new Date(ms).toLocaleTimeString(LOCALE[lang] ?? "ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
/** 날짜 구분선: 2026년 10월 10일 토요일 (올해면 연도 생략) */
const dateLine = (ms: number, lang: string) =>
  new Date(ms).toLocaleDateString(LOCALE[lang] ?? "ko-KR", { year: dayKey(ms).slice(0, 4) === dayKey(Date.now()).slice(0, 4) ? undefined : "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul" });

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

export default function Chat({ user, enabled, threads, goLogin, openChat, openPost, push, toast, onChanged }: { user: User | null; enabled: boolean; threads: Thread[]; goLogin: () => void; openChat: (th: Thread) => void; openPost: (postId: string) => void; push: ReturnType<typeof usePush>; toast: (m: string) => void; onChanged?: () => void }) {
  const t = useT();
  const lang = useLang();
  const [busyId, setBusyId] = useState<string | null>(null);
  // 수락 전 신청만 목록에서 바로 취소한다(서버도 대기 중인 신청만 지운다).
  const cancel = async (th: Thread) => {
    if (!window.confirm(t("신청을 취소할까요? 수락 전이라 언제든 다시 신청할 수 있어요."))) return;
    setBusyId(th.id);
    const r = await api(`/api/requests?id=${th.id}`, "DELETE");
    setBusyId(null);
    if (!r.ok) return toast(t(r.error));
    toast(t("신청을 취소했어요."));
    onChanged?.();
  };
  // 받은 신청(내 글에 온 신청)은 '수락 필요'로 보여 주고, 누르면 글 상세에서 수락·거절할 수 있다.
  const statusFor = (th: Thread) => (th.iAmOwner && th.status === "pending" ? t("수락 필요") : statusText[th.status]);
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
            <div key={th.id} className="flex items-center gap-2 px-5 py-4">
              <button data-block-id="C030" data-block-name="대화 항목" disabled={th.status === "declined"} onClick={() => (th.status === "accepted" ? openChat(th) : openPost(th.postId))} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left disabled:opacity-70">
              <Avatar src={th.otherPhoto} name={th.other} role={th.otherRole} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{th.other} <TierBadge tier={th.otherTier} /> <span className="font-normal text-sub">· {th.origin} → {th.dest}</span></span>
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
                <Tag tone={th.status === "accepted" || (th.iAmOwner && th.status === "pending") ? "accent" : "plain"}>{statusFor(th)}</Tag>
              )}
              </button>
              {th.status === "pending" && !th.iAmOwner && (
                <button type="button" data-block-id="B305" data-block-name="신청 취소(목록)" disabled={busyId === th.id} onClick={() => cancel(th)} className="shrink-0 rounded-xl border border-line bg-white px-3 py-2 text-[14px] font-semibold text-ink disabled:opacity-50">
                  {busyId === th.id ? t("처리 중…") : t("신청 취소")}
                </button>
              )}
            </div>
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
  // 마지막으로 본 대화는 이 창(sessionStorage)에 두었다가 다시 열 때 바로 보여 준다. 창을 닫으면 지워진다.
  const cacheKey = `modu.chat.${thread.id}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      const c = JSON.parse(sessionStorage.getItem(cacheKey) || "null") as Msg[] | null;
      return Array.isArray(c) ? c : [];
    } catch {
      return [];
    }
  });
  const lastServerId = useRef(msgs.reduce((m, x) => Math.max(m, x.id), 0));
  useEffect(() => {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(msgs.filter((m) => !m.image?.startsWith("data:")).slice(-100)));
    } catch {
      /* 저장 공간이 없으면 넘어간다 */
    }
  }, [msgs, cacheKey]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(thread.myStars ?? 0);
  const [otherUnread, setOtherUnread] = useState(0);
  const [nudgedAt, setNudgedAt] = useState<number | null>(null);
  const [nudgeCost, setNudgeCost] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const count = useRef(0);

  // 대화가 오가는 중(최근 1분 안에 메시지·입력)이면 3초, 잠잠하면 10초, 5분 넘게 조용하면 20초마다 새로 받는다.
  // 화면이 꺼져 있으면 쉬고, 다시 켜지면 바로 받는다.
  const activeAt = useRef(Date.now());
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const load = async () => {
      // 처음에는 전체(최근 200개), 그 뒤로는 마지막 번호 이후의 새 메시지만 받는다.
      const after = first ? 0 : lastServerId.current;
      const r = await api<{ messages: Msg[]; partial?: boolean; otherUnread: number; nudgedAt: number | null; nudgeCost: number }>(`/api/messages?request=${thread.id}${after ? `&after=${after}` : ""}`);
      if (alive && r.ok) {
        const got = r.data.messages;
        if (!first && got.length) activeAt.current = Date.now();
        first = false;
        if (got.length) lastServerId.current = Math.max(lastServerId.current, ...got.map((m) => m.id));
        if (r.data.partial) {
          if (got.length) setMsgs((cur) => [...cur.filter((m) => !got.some((g) => g.id === m.id)), ...got].sort((a, b) => a.id - b.id).slice(-200));
        } else {
          setMsgs(got);
        }
        setOtherUnread(r.data.otherUnread ?? 0);
        setNudgedAt(r.data.nudgedAt ?? null);
        setNudgeCost(r.data.nudgeCost ?? 0);
      }
    };
    const next = () => {
      const idle = Date.now() - activeAt.current;
      timer = setTimeout(tick, idle < 60_000 ? 3000 : idle < 300_000 ? 10_000 : 20_000);
    };
    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (alive) next();
    };
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      activeAt.current = Date.now();
      clearTimeout(timer);
      tick();
    };
    load().then(() => alive && next());
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [thread.id]);

  useEffect(() => {
    if (msgs.length !== count.current) end.current?.scrollIntoView({ block: "end" });
    count.current = msgs.length;
  }, [msgs]);

  // 별을 누르면 바로 저장하지 않고, 카풀을 마친 뒤 남겨 달라는 안내 창을 먼저 띄운다.
  const [askStars, setAskStars] = useState(0);
  const [contractOpen, setContractOpen] = useState(false);
  const notYet = !thread.regular && thread.departAt > Date.now();
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
    if (nudgeCost && !window.confirm(`${t("메일로 알리기")}: ${nudgeCost.toLocaleString("ko-KR")} ${t("크레딧이 사용돼요. 보낼까요?")}`)) return;
    setBusy(true);
    const r = await api<{ cost: number }>("/api/messages", "PUT", { requestId: thread.id });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setNudgedAt(Date.now());
    toast(t("상대에게 메일로 알렸어요.") + (r.data.cost ? ` −${r.data.cost.toLocaleString("ko-KR")} ${t("크레딧")}` : ""));
    onChanged();
  };
  const mineUnread = new Set(otherUnread > 0 ? msgs.filter((m) => m.mine).slice(-otherUnread).map((m) => m.id) : []);
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
    activeAt.current = Date.now();
    const sentId = (r.data as { id?: number }).id ?? Date.now();
    setMsgs((m) => [...m, { id: sentId, mine: true, body, at: Date.now() }]);
  };

  return (
    <Sheet title={`${thread.other} · ${thread.origin} → ${thread.dest}`} blockId="S030" onClose={onClose}>
      <div className="space-y-3">
        {thread.otherId && (
          <div className="flex items-center justify-between gap-3">
            <button data-block-id="B032" data-block-name="상대 프로필" className="flex min-h-0 min-w-0 items-center gap-2 font-semibold" onClick={() => onProfile(thread.otherId as string)}>
              <Avatar src={thread.otherPhoto} name={thread.other} role={thread.otherRole} size={32} />
              <span className="truncate underline decoration-line underline-offset-4">{thread.other}</span>
              <TierBadge tier={thread.otherTier} />
            </button>
            <span className="flex shrink-0 gap-3 text-[14px]">
              <button data-block-id="B033" data-block-name="신고하기" className="min-h-0 py-2 text-warn underline" onClick={() => onReport(thread.otherId as string, thread.other, thread.id)}>{t("신고하기")}</button>
              <button data-block-id="B031" data-block-name="회원 차단" className="min-h-0 py-2 text-sub underline" onClick={() => onBlock(thread.otherId as string, thread.other)}>{t("차단")}</button>
            </span>
          </div>
        )}
        <div className="space-y-2 rounded-2xl bg-bg p-4 text-[14px]">
          <div data-block-id="C037" data-block-name="대화 구간" className="[&_p]:text-[15px]">
            <Route origin={thread.origin} dest={thread.dest} originArea={thread.originArea} destArea={thread.destArea} />
          </div>
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
          {thread.cost === "fixed" && <p><span className="text-sub">{t("카풀 비용")}: </span><b className="num">{money(thread.price ?? 0, lang)}</b></p>}
          {thread.cost === "meter" && SHOW_METER && (
            <a href={METER_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-0 items-center gap-1 font-semibold text-accent">{t("모카 미터기로 비용 나누기")} {Icon.arrow()}</a>
          )}
        </div>
        {thread.regular && thread.status === "accepted" && (
          <button type="button" data-block-id="B428" data-block-name="정기카풀 계약서" onClick={() => setContractOpen(true)} className="flex w-full items-center justify-between gap-2 rounded-2xl border border-accent bg-accentSoft px-4 py-3 text-left text-[15px] font-semibold text-accent">
            <span>📄 {t("정기카풀 계약서")} <span className="font-normal text-[13px]">· {t("요일·시간·비용·취소 약속을 적어 두기")}</span></span>
            {Icon.arrow()}
          </button>
        )}
        {contractOpen && <ContractSheet requestId={thread.id} toast={toast} onClose={() => setContractOpen(false)} />}
        <ChatManners />
        <div className="min-h-[30vh] space-y-2 supports-[height:1dvh]:min-h-[30dvh]" aria-live="polite">
          {msgs.length === 0 && <p className="py-8 text-center text-[15px] text-sub">{t("첫 인사를 건네 보세요.")}</p>}
          {msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
            // 같은 사람이 같은 분에 이어 보낸 메시지는 마지막 것에만 시간을 붙인다.
            const showTime = !next || next.mine !== m.mine || minuteKey(next.at) !== minuteKey(m.at);
            // 상대가 아직 읽지 않은 내 메시지(뒤에서부터 otherUnread개)
            const unread = m.mine && mineUnread.has(m.id);
            const meta = (showTime || unread) && (
              <span className={`flex shrink-0 flex-col justify-end pb-0.5 text-[11px] leading-tight ${m.mine ? "items-end" : "items-start"}`}>
                {unread && <b className="num text-accent" aria-label={t("안 읽음")}>1</b>}
                {showTime && <time dateTime={new Date(m.at).toISOString()} className="num text-sub">{clock(m.at, lang)}</time>}
              </span>
            );
            return (
              <div key={m.id}>
                {newDay && (
                  <p data-block-id="C211" data-block-name="날짜 구분" className="my-2 flex items-center gap-3 text-[12px] text-sub before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
                    {dateLine(m.at, lang)}
                  </p>
                )}
                <div className={`flex items-end gap-1.5 ${m.mine ? "justify-end" : "justify-start"}`}>
                  {m.mine && meta}
                  {m.image ? (
                    <a href={m.image} target="_blank" rel="noopener noreferrer" className="block max-w-[70%] overflow-hidden rounded-2xl border border-line bg-bg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img data-block-id="C034" src={m.image} alt={t("보낸 사진")} loading="lazy" className="block max-h-72 w-auto object-cover" />
                    </a>
                  ) : (
                    <p className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] ${m.mine ? "bg-accent text-white" : "bg-bg text-ink"}`}>{m.body}</p>
                  )}
                  {!m.mine && meta}
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>
        {otherUnread > 0 && msgs.length > 0 && (
          <div data-block-id="C038" data-block-name="메일로 알리기" className="flex items-center justify-between gap-3 rounded-2xl bg-bg px-4 py-2.5">
            <span className="text-[13px] text-sub">{t("상대가 아직 읽지 않은 메시지")} <b className="num text-ink">{otherUnread}</b></span>
            <button data-block-id="B036" data-block-name="메일로 알리기" disabled={busy || nudgeLocked} className="min-h-0 shrink-0 rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-accent disabled:text-sub" onClick={nudge}>
              {nudgeLocked ? t("메일 알림 보냄") : `${t("메일로 알리기")}${nudgeCost ? ` · ${nudgeCost.toLocaleString("ko-KR")}C` : ""}`}
            </button>
          </div>
        )}
        {thread.canRate && (
          <div data-block-id="C031" data-block-name="별점 남기기" className="flex items-center justify-between rounded-2xl border border-line px-4 py-2">
            <span className="text-[14px] text-sub">{stars ? t("내가 남긴 별점") : t("카풀은 어땠나요? 별점을 남겨 주세요.")}</span>
            <Stars value={stars} onChange={setAskStars} size={24} />
          </div>
        )}
        {askStars > 0 && createPortal(
          <div data-block-id="C032" data-block-name="별점 확인" role="dialog" aria-modal="true" aria-label={t("별점 남기기")} className="fade-in fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 px-6" onClick={() => setAskStars(0)}>
            <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-[0_14px_40px_rgba(21,35,61,0.28)]" onClick={(e) => e.stopPropagation()}>
              <p className="text-[18px] font-bold">{t("카풀을 마친 뒤에 별점을 남겨 주세요")}</p>
              <p className="text-[14px] leading-relaxed text-sub">
                {notYet ? t("아직 출발 전이에요. 같이 다녀온 뒤에 남겨 주시면 다른 회원에게 더 정확한 정보가 돼요.") : t("별점은 상대 프로필에 쌓여 다른 회원이 참고해요. 카풀을 마쳤다면 남겨 주세요.")}
              </p>
              <div className="flex justify-center"><Stars value={askStars} onChange={setAskStars} size={30} /></div>
              {notYet ? (
                <button type="button" className={btnPrimary} onClick={() => setAskStars(0)}>{t("확인")}</button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className="min-h-[48px] flex-1 rounded-2xl border border-line bg-white text-[15px] text-sub" onClick={() => setAskStars(0)}>{t("아직이에요")}</button>
                  <button type="button" data-block-id="B037" data-block-name="별점 남기기 확인" className={`${btnPrimary} flex-1`} onClick={() => { const n = askStars; setAskStars(0); void rate(n); }}>{t("카풀 마쳤어요 · 남기기")}</button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
        <form onSubmit={send} className="sticky bottom-0 flex gap-2 bg-surface pt-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => sendPhoto(e.target.files?.[0])} />
          <button type="button" data-block-id="B034" data-block-name="사진 보내기" aria-label={t("사진 보내기")} disabled={busy} className="grid shrink-0 place-items-center rounded-xl border border-line px-3 text-sub disabled:opacity-40" onClick={() => fileRef.current?.click()}>{Icon.image(1.6)}</button>
          <input data-block-id="F030" className={field} maxLength={500} placeholder={t("메시지 입력")} aria-label={t("메시지 입력")} value={text} onChange={(e) => { setText(e.target.value); activeAt.current = Date.now(); }} />
          <button data-block-id="B030" data-block-name="전송" disabled={busy || !text.trim()} className="shrink-0 rounded-xl bg-accent px-5 font-semibold text-white disabled:opacity-40">{t("전송")}</button>
        </form>
      </div>
    </Sheet>
  );
}
