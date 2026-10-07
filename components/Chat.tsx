"use client";
import { useEffect, useRef, useState } from "react";
import { METER_URL, type Thread, type User } from "@/lib/types";
import { Card, Icon, Sheet, Tag, api, btnPrimary, field, useLang, useT, when } from "./ui";

type Msg = { id: number; mine: boolean; body: string; at: number };

export default function Chat({ user, enabled, threads, goLogin, openChat }: { user: User | null; enabled: boolean; threads: Thread[]; goLogin: () => void; openChat: (th: Thread) => void }) {
  const t = useT();
  const lang = useLang();
  const statusText = { pending: t("수락 대기 중"), accepted: t("수락됨"), declined: t("거절됨") };

  return (
    <section data-block-id="S003" data-block-name="채팅" className="space-y-4">
      <header>
        <h1 className="text-[28px] font-bold">{t("채팅")}</h1>
        <p className="mt-1 text-sub">{t("신청이 수락되면 여기서 대화할 수 있어요.")}</p>
      </header>
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
              <div className="min-w-0">
                <p className="truncate font-semibold">{th.other} <span className="font-normal text-sub">· {th.iAmOwner ? t("받은 신청") : t("보낸 신청")}</span></p>
                <p className="truncate text-[14px] text-sub">{th.origin} → {th.dest}</p>
                <p className="num text-[13px] text-sub">{when(th.departAt, lang)}</p>
              </div>
              <Tag tone={th.status === "accepted" ? "accent" : "plain"}>{statusText[th.status]}</Tag>
            </button>
          ))}
        </Card>
      )}
    </section>
  );
}

export function ChatRoom({ thread, onClose, toast }: { thread: Thread; onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api<{ messages: Msg[] }>(`/api/messages?request=${thread.id}`);
      if (alive && r.ok) setMsgs(r.data.messages);
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
        <div className="space-y-2 rounded-2xl bg-bg p-4 text-[14px]">
          <p><span className="text-sub">{t("상대 연락 수단")}: </span><b className="break-all">{thread.contact || t("등록된 연락 수단이 없어요.")}</b></p>
          {thread.cost === "meter" && (
            <a href={METER_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-0 items-center gap-1 font-semibold text-accent">{t("모카 미터기로 비용 나누기")} {Icon.arrow()}</a>
          )}
        </div>
        <div className="min-h-[30dvh] space-y-2" aria-live="polite">
          {msgs.length === 0 && <p className="py-8 text-center text-[15px] text-sub">{t("첫 인사를 건네 보세요.")}</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] ${m.mine ? "bg-accent text-white" : "bg-bg text-ink"}`}>{m.body}</p>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form onSubmit={send} className="sticky bottom-0 flex gap-2 bg-surface pt-2">
          <input data-block-id="F030" className={field} maxLength={500} placeholder={t("메시지 입력")} aria-label={t("메시지 입력")} value={text} onChange={(e) => setText(e.target.value)} />
          <button data-block-id="B030" data-block-name="전송" disabled={busy || !text.trim()} className="shrink-0 rounded-xl bg-accent px-5 font-semibold text-white disabled:opacity-40">{t("전송")}</button>
        </form>
      </div>
    </Sheet>
  );
}
