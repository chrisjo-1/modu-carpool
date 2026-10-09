"use client";
import { useCallback, useEffect, useState } from "react";
import { translate, type Lang } from "@/lib/i18n";
import type { Post, Thread, User } from "@/lib/types";
import Chat, { ChatRoom } from "./Chat";
import CommuteSheet from "./Commute";
import Home, { PostDetail } from "./Home";
import Me from "./Me";
import { MemberSheet, ReasonSheet } from "./Member";
import ResetSheet from "./Reset";
import { usePush } from "./Push";
import PostForm from "./PostForm";
import { Icon, LangContext, Sheet, api } from "./ui";

type Tab = "home" | "post" | "chat" | "me";
const LANG_KEY = "modu.lang";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [lang, setLangState] = useState<Lang>("ko");
  const [posts, setPosts] = useState<Post[]>([]);
  const [sample, setSample] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<Post | null>(null);
  const [room, setRoom] = useState<Thread | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [member, setMember] = useState<string | null>(null);
  const [why, setWhy] = useState<{ mode: "report" | "block"; userId: string; name: string; requestId?: string } | null>(null);
  const [commute, setCommute] = useState<{ post: Post | null; onboarding: boolean } | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [wantRoom, setWantRoom] = useState("");
  const push = usePush(!!user);
  const [version, setVersion] = useState(0);
  const t = (ko: string) => translate(lang, ko);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* 무시 */
    }
  };

  const loadPosts = useCallback(async () => {
    const r = await api<{ posts: Post[]; sample: boolean }>("/api/posts");
    if (r.ok) {
      setPosts(r.data.posts);
      setSample(!!r.data.sample);
    }
    setLoaded(true);
    return r.ok ? r.data.posts : [];
  }, []);

  const loadThreads = useCallback(async () => {
    const r = await api<{ threads: Thread[] }>("/api/requests");
    if (r.ok) setThreads(r.data.threads);
  }, []);

  // 첫 진입: 언어 복원, 글 목록, 로그인 상태, 공유 링크(?p=)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as Lang | null;
      const guess = (navigator.language || "ko").slice(0, 2) as Lang;
      const pick = saved ?? guess;
      if (["ko", "en", "ja", "zh"].includes(pick)) setLangState(pick);
    } catch {
      /* 무시 */
    }
    loadPosts().then((list) => {
      const q = new URLSearchParams(location.search);
      const reset = q.get("reset");
      if (reset) setResetToken(reset);
      // 푸시·메일 알림에서 들어온 경우: ?tab=chat 이면 채팅 탭, ?room=신청ID 면 그 대화방
      if (q.get("tab") === "chat" || q.get("room")) setTab("chat");
      if (q.get("room")) setWantRoom(q.get("room") as string);
      if (q.get("tab") || q.get("room")) history.replaceState(null, "", location.pathname);
      const id = new URLSearchParams(location.search).get("p");
      const hit = id && list.find((p) => p.id === id);
      if (hit) setOpen(hit);
    });
    api<{ enabled: boolean; user: User | null }>("/api/auth").then((r) => {
      setEnabled(!!r.data.enabled);
      setUser(r.data.user ?? null);
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [loadPosts]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // 로그인 중에는 신청 상태를 주기적으로 새로 받는다.
  useEffect(() => {
    if (!user) return setThreads([]);
    loadThreads();
    loadPosts();
    const id = setInterval(() => document.visibilityState === "visible" && loadThreads(), 20000);
    return () => clearInterval(id);
  }, [user, loadThreads, loadPosts]);

  // 다른 사람이 새로 올린 글이 보이도록, 화면이 켜져 있으면 30초마다, 앱으로 돌아오면 바로 목록을 새로 받는다.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && loadPosts();
    const id = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [loadPosts]);

  useEffect(() => {
    if (!wantRoom) return;
    const th = threads.find((x) => x.id === wantRoom && x.status === "accepted");
    if (th) {
      setRoom(th);
      setWantRoom("");
    }
  }, [wantRoom, threads]);

  useEffect(() => {
    if (!toastMsg) return;
    const id = setTimeout(() => setToastMsg(""), 2600);
    return () => clearTimeout(id);
  }, [toastMsg]);

  const refresh = async () => {
    const list = await loadPosts();
    if (user) await loadThreads();
    setVersion((v) => v + 1);
    const cur = open;
    if (!cur) return;
    let next = list.find((p) => p.id === cur.id) ?? null;
    if (!next && cur.mine) {
      // 마감한 내 글은 전체 목록에 없으므로 내 글 목록에서 다시 찾는다.
      const r = await api<{ posts: Post[] }>("/api/posts?mine=1");
      next = (r.ok && r.data.posts.find((p) => p.id === cur.id)) || null;
    }
    setOpen((now) => (now && now.id === cur.id ? next : now));
  };

  /** 등록 탭에서 정기카풀(출퇴근)을 고르면, 이미 올린 정기카풀이 있는지 확인해 입력 창을 연다. */
  const openRegular = async () => {
    const r = await api<{ posts: Post[] }>("/api/posts?mine=1");
    setCommute({ post: (r.ok && r.data.posts.find((p) => p.regular)) || null, onboarding: false });
  };

  /** 사유 창에서 제출: 신고는 접수만 하고, 차단은 관련 창을 닫고 목록을 새로 받는다. */
  const submitWhy = async (reason: string, detail: string) => {
    if (!why) return;
    const r = await api(why.mode === "report" ? "/api/reports" : "/api/blocks", "POST", { userId: why.userId, reason, detail, requestId: why.requestId });
    if (!r.ok) return setToastMsg(t(r.error));
    setToastMsg(t(why.mode === "report" ? "신고를 접수했어요. 운영자가 확인합니다." : "차단했어요."));
    if (why.mode === "block") {
      setMember(null);
      setRoom(null);
      setOpen(null);
      await refresh();
    }
    setWhy(null);
  };

  const goLogin = () => {
    setOpen(null);
    setTab("me");
  };
  const openChat = (th: Thread) => {
    setOpen(null);
    setRoom(th);
  };

  // 채팅 아이콘 뱃지: 안 읽은 메시지 + 아직 답하지 않은 받은 신청
  const pending = threads.reduce((n, th) => n + (th.unread ?? 0) + (th.iAmOwner && th.status === "pending" ? 1 : 0), 0);
  const tabs: { id: Tab; label: string; icon: (w?: number) => React.ReactNode; block: string }[] = [
    { id: "home", label: t("찾기"), icon: Icon.home, block: "N001" },
    { id: "post", label: t("등록"), icon: Icon.plus, block: "N002" },
    { id: "chat", label: t("채팅"), icon: Icon.chat, block: "N003" },
    { id: "me", label: t("내 정보"), icon: Icon.user, block: "N004" },
  ];

  return (
    <LangContext.Provider value={lang}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        {user?.test && (
          <p data-block-id="C090" data-block-name="테스트 회원 안내" className="flex items-center justify-between gap-3 border-b border-line bg-accentSoft px-5 py-2 text-[13px] text-ink">
            <span>테스트 회원 <b>{user.name}</b> 화면으로 보는 중</span>
            <a href="/admin" className="shrink-0 font-semibold text-accent underline">관리자로 돌아가기</a>
          </p>
        )}
        <header className="flex items-center gap-3 px-5 pb-2 pt-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white">{Icon.car(1.8)}</span>
          <div>
            <p className="text-xl font-bold leading-tight">{t("모두의카풀")}</p>
            <p className="text-[13px] leading-tight text-sub">{t("같은 방향, 같이 가요")}</p>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-3">
          {tab === "home" &&
            (loaded ? <Home posts={posts} sample={sample} onOpen={setOpen} toast={setToastMsg} /> : <div className="h-72 animate-pulse rounded-3xl bg-white" aria-hidden />)}
          {tab === "post" && <PostForm user={user} enabled={enabled} goLogin={goLogin} toast={setToastMsg} onRegular={openRegular} onDone={async (id) => { await refresh(); setTab("home"); if (!id) return; const r = await api<{ posts: Post[] }>("/api/posts?mine=1"); const made = r.ok && r.data.posts.find((p) => p.id === id); if (made) setOpen(made); }} />}
          {tab === "chat" && <Chat user={user} enabled={enabled} threads={threads} goLogin={goLogin} openChat={openChat} push={push} toast={setToastMsg} />}
          {tab === "me" && <Me user={user} enabled={enabled} setUser={setUser} setLang={setLang} onOpen={setOpen} version={version} toast={setToastMsg} onCommute={(post, onboarding) => setCommute({ post, onboarding })} onChanged={refresh} onProfile={setMember} onEdit={(p) => (p.regular ? setCommute({ post: p, onboarding: false }) : setEditing(p))} push={push} />}
        </main>

        <nav aria-label={t("하단 메뉴")} className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
          <ul className="mx-auto grid max-w-md grid-cols-4">
            {tabs.map((x) => {
              const on = tab === x.id;
              return (
                <li key={x.id}>
                  <button data-block-id={x.block} data-block-name={x.label} aria-current={on ? "page" : undefined} onClick={() => setTab(x.id)} className={`relative flex w-full flex-col items-center gap-0.5 py-2.5 text-xs ${on ? "font-semibold text-accent" : "text-sub"}`}>
                    <span className="relative">
                      {x.icon(on ? 1.9 : 1.5)}
                      {x.id === "chat" && pending > 0 && (
                        <span data-block-id="C035" data-block-name="채팅 뱃지" aria-label={`${t("새 알림")} ${pending}`} className="num absolute -right-3 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-warn px-1 text-[11px] font-bold leading-none text-white">{pending > 99 ? "99+" : pending}</span>
                      )}
                    </span>
                    {x.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {open && <PostDetail post={open} user={user} sample={sample} threads={threads} onClose={() => setOpen(null)} onChanged={refresh} goLogin={goLogin} openChat={openChat} toast={setToastMsg} onEditCommute={(p) => { setOpen(null); setCommute({ post: p, onboarding: false }); }} onEdit={(p) => { setOpen(null); setEditing(p); }} onProfile={setMember} onBlock={(userId, name) => setWhy({ mode: "block", userId, name })} />}
        {editing && (
          <Sheet title={t("글 수정")} blockId="S070" onClose={() => setEditing(null)}>
            <PostForm initial={editing} user={user} enabled={enabled} goLogin={goLogin} toast={setToastMsg} onRegular={openRegular} onDone={() => { setEditing(null); refresh(); }} />
          </Sheet>
        )}
        {commute && <CommuteSheet initial={commute.post} onboarding={commute.onboarding} onClose={() => setCommute(null)} toast={setToastMsg} onDone={() => { setCommute(null); refresh(); setTab("home"); }} />}
        {room && <ChatRoom thread={room} onClose={() => { setRoom(null); loadThreads(); }} toast={setToastMsg} onChanged={refresh} onProfile={setMember} onReport={(userId, name, requestId) => setWhy({ mode: "report", userId, name, requestId })} onBlock={(userId, name) => setWhy({ mode: "block", userId, name })} />}
        {member && <MemberSheet userId={member} onClose={() => setMember(null)} toast={setToastMsg} onReport={(userId, name) => setWhy({ mode: "report", userId, name })} onBlock={(userId, name) => setWhy({ mode: "block", userId, name })} />}
        {resetToken && (
          <ResetSheet
            token={resetToken}
            onClose={() => {
              setResetToken("");
              history.replaceState(null, "", location.pathname);
            }}
            onDone={(u) => {
              setUser(u);
              setResetToken("");
              history.replaceState(null, "", location.pathname);
              setTab("me");
              setToastMsg(t("새 비밀번호로 바꾸고 로그인했어요."));
            }}
            toast={setToastMsg}
          />
        )}
        {why && <ReasonSheet mode={why.mode} name={why.name} onClose={() => setWhy(null)} onSubmit={submitWhy} />}
        {toastMsg && (
          <div role="status" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-line bg-white px-4 py-3 text-center text-sm font-medium text-ink shadow-card">{toastMsg}</div>
        )}
      </div>
    </LangContext.Provider>
  );
}
