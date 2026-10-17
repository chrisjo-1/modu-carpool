"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { translate, type Lang } from "@/lib/i18n";
import type { Post, Thread, User } from "@/lib/types";
import Chat, { ChatRoom } from "./Chat";
import CommuteSheet from "./Commute";
import Home, { PostDetail, RoleSwitch } from "./Home";
import Me from "./Me";
import { MemberSheet, ReasonSheet } from "./Member";
import ResetSheet from "./Reset";
import Withdraw from "./Withdraw";
import Gate from "./Gate";
import { NoticePopup } from "./Notices";
import { ConsentSheet, VerifyBanner } from "./Account";
import Splash from "./Splash";
import TopLoading from "./TopLoading";
import Banners from "./Banners";
import Interests from "./Interests";
import CommuteStart from "./CommuteStart";
import CommuteOnboard from "./CommuteOnboard";
import { creditText } from "./Credits";
import { usePush } from "./Push";
import PostForm from "./PostForm";
import { Bubble, HintContext, Icon, LangContext, Sheet, api } from "./ui";
import type { Place } from "@/lib/types";

type Tab = "home" | "post" | "subway" | "chat" | "me";

// 지하철 탭은 탭을 열 때만 불러온다(첫 화면 부담 없음). 기능을 뺄 때 이 줄과 아래 탭 항목을 지운다.
const SubwayTab = dynamic(() => import("./subway/SubwayTab"), { ssr: false, loading: () => <p className="px-1 pt-4 text-sm text-sub">…</p> });
const LANG_KEY = "modu.lang";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  // 지하철 탭을 보여 줄지(앉아가기 열림 또는 관리자). 첫 화면을 막지 않도록 뒤에서 불러온다.
  const [seatVisible, setSeatVisible] = useState(false);
  useEffect(() => {
    fetch("/api/seat/config").then((r) => r.json()).then((j) => setSeatVisible(!!j.visible)).catch(() => {});
  }, []);
  // 홈 상단 주제목(관리자 > 사이트에서 바꾼 문구). 못 받으면 기본 문구.
  const [slogan, setSlogan] = useState("같은 방향, 같이 가요");
  useEffect(() => {
    fetch("/api/site")
      .then((r) => r.json())
      .then((j) => { if (typeof j.slogan === "string" && j.slogan) setSlogan(j.slogan); })
      .catch(() => null);
  }, []);
  const [lang, setLangState] = useState<Lang>("ko");
  const [posts, setPosts] = useState<Post[]>([]);
  const [sample, setSample] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 새로고침 때 열어 둔 글을 복원했는지: 복원이 끝나기 전에는 로딩 화면을 내리지 않는다.
  const [screenRestored, setScreenRestored] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<Post | null>(null);
  const [room, setRoom] = useState<Thread | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [member, setMember] = useState<string | null>(null);
  const [why, setWhy] = useState<{ mode: "report" | "block"; userId: string; name: string; requestId?: string } | null>(null);
  const [commute, setCommute] = useState<{ post: Post | null; onboarding: boolean; prefill?: { origin: Place; dest: Place } } | null>(null);

  // 로그인한 회원의 현재 위치를 앱을 열 때 기록한다(CALL 대상 찾기용).
  // 위치 권한이 이미 허용된 경우에만 조용히 보내고, 권한 창은 띄우지 않는다. 5분에 한 번만 보낸다.
  const lastPing = useRef(0);
  useEffect(() => {
    if (!user) return;
    const ping = () => {
      if (Date.now() - lastPing.current < 5 * 60_000) return;
      if (!("geolocation" in navigator) || !navigator.permissions) return;
      navigator.permissions
        .query({ name: "geolocation" })
        .then((s) => {
          if (s.state !== "granted") return;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lastPing.current = Date.now();
              void api("/api/location", "POST", { lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            () => {},
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
          );
        })
        .catch(() => {});
    };
    ping();
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user]);
  const [commuteStart, setCommuteStart] = useState(false);
  // 가입 직후 필수 등록 흐름(희망 선택 → 출퇴근 출발·도착지 → 정기카풀 게시). 끝날 때까지 닫을 수 없다.
  const [joinFlow, setJoinFlow] = useState(false);
  // 차량 등록 시트 등에서 회원 정보가 바뀌면 여기서도 같은 값을 쓰도록 맞춘다.
  useEffect(() => {
    const onUser = (e: Event) => setUser((e as CustomEvent<User>).detail);
    window.addEventListener("moducarpool:user", onUser);
    return () => window.removeEventListener("moducarpool:user", onUser);
  }, []);
  const [pickInterests, setPickInterests] = useState(false);
  // 첫 화면 로딩: 로그인 확인과 글 목록이 끝나면 사라진다. 8초가 지나도 안 끝나면 그냥 넘어간다.
  const [splashGone, setSplashGone] = useState(false);
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [withdrawToken, setWithdrawToken] = useState("");
  const [bubbleTexts, setBubbleTexts] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/bubbles").then((r) => r.json()).then((j) => setBubbleTexts(j.texts ?? {})).catch(() => {});
  }, []);
  const [wantRoom, setWantRoom] = useState("");
  // 로그인 확인이 끝났는지, 로그인 없이 둘러보는 중인지(이 탭에서만 기억)
  const [checked, setChecked] = useState(false);
  const [preview, setPreviewState] = useState(false);
  const [sharedPost, setSharedPost] = useState("");
  const [noticeFocus, setNoticeFocus] = useState(0);
  const [feedbackFirst, setFeedbackFirst] = useState(false);
  const [consentLater, setConsentLater] = useState(false);
  const setPreview = (v: boolean) => {
    setPreviewState(v);
    try {
      if (v) sessionStorage.setItem("modu.preview", "1");
      else sessionStorage.removeItem("modu.preview");
    } catch {
      /* 무시 */
    }
  };
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

  const langNow = (): Lang => {
    try {
      const l = localStorage.getItem(LANG_KEY) as Lang | null;
      return l && ["ko", "en", "ja", "zh"].includes(l) ? l : "ko";
    } catch {
      return "ko";
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

  // 새로고침해도 보던 화면을 유지한다: 탭과 열어 둔 글을 이 창의 sessionStorage에 저장한다.
  const screenReady = useRef(false);
  useEffect(() => {
    if (!screenReady.current) return;
    try {
      sessionStorage.setItem("modu.tab", tab);
    } catch {
      /* 무시 */
    }
  }, [tab]);
  useEffect(() => {
    if (!screenReady.current) return;
    try {
      if (open) sessionStorage.setItem("modu.open", open.id);
      else sessionStorage.removeItem("modu.open");
    } catch {
      /* 무시 */
    }
  }, [open]);

  // 첫 진입: 언어 복원, 글 목록, 로그인 상태, 공유 링크(?p=)
  useEffect(() => {
    try {
      const savedTab = sessionStorage.getItem("modu.tab") as Tab | null;
      if (savedTab === "chat" || savedTab === "me") setTab(savedTab);
    } catch {
      /* 무시 */
    }
    screenReady.current = true;
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
      // 탈퇴 확인 링크: 메일의 링크로 들어오면 탈퇴를 완료한다.
      const withdraw = q.get("withdraw");
      if (withdraw) {
        history.replaceState(null, "", location.pathname);
        setWithdrawToken(withdraw);
      }
      // 워프 이메일 확인 링크: 누른 회원에게 연결하고 이전 축하 크레딧을 한 번 준다.
      const legacyToken = q.get("legacy");
      if (legacyToken) {
        history.replaceState(null, "", location.pathname);
        api<{ ok: boolean; legacy?: number }>("/api/auth", "POST", { action: "legacyConfirm", token: legacyToken }).then((r) => {
          if (!r.ok) return setToastMsg(translate(langNow(), r.error));
          setToastMsg(`${translate(langNow(), "워프 회원 확인이 끝났어요.")}${r.data.legacy ? ` +${creditText(r.data.legacy, langNow())} ${translate(langNow(), "크레딧")}` : ""}`);
          setTab("me");
        });
      }
      const verify = q.get("verify");
      if (verify) {
        history.replaceState(null, "", location.pathname);
        api<{ user: User; legacy?: number; welcome?: number; created?: boolean; legacyPending?: boolean }>("/api/auth", "POST", { action: "verify", token: verify }).then((r) => {
          if (!r.ok) return setToastMsg(translate(langNow(), r.error));
          setUser(r.data.user);
          setPreview(false);
          setTab("me");
          // 인증 링크로 가입이 끝난 경우: 가입 축하 크레딧과 워프 이전 크레딧을 함께 알린다.
          const msg = translate(langNow(), r.data.created ? "가입을 마쳤어요. 환영합니다!" : "이메일 인증을 마쳤어요. 이제 글쓰기와 카풀 신청을 할 수 있어요.");
          const bonus = [r.data.welcome ? `${translate(langNow(), "가입 축하 크레딧이 적립됐어요.")} +${creditText(r.data.welcome, langNow())}` : "", r.data.legacy ? `${translate(langNow(), "워프 회원 이전 축하")} +${creditText(r.data.legacy, langNow())}` : ""].filter(Boolean).join(" · ");
          const pendingMsg = r.data.legacyPending ? translate(langNow(), "워프 회원 확인 메일을 보냈어요. 메일의 링크를 누르면 이전 축하 크레딧을 드려요.") : "";
          setToastMsg([bonus ? `${msg} ${bonus}` : msg, pendingMsg].filter(Boolean).join(" "));
        });
      }
      // 푸시·메일 알림에서 들어온 경우: ?tab=chat 이면 채팅 탭, ?room=신청ID 면 그 대화방
      if (q.get("tab") === "chat" || q.get("room")) setTab("chat");
      if (q.get("tab") === "me") setTab("me");
      if (q.get("tab") === "subway") setTab("subway");
      if (q.get("room")) setWantRoom(q.get("room") as string);
      if (q.get("notice")) setNoticeFocus(Number(q.get("notice")) || 0);
      if (q.get("feedback")) {
        setFeedbackFirst(true);
        setTab("me");
      }
      if (q.get("tab") || q.get("room") || q.get("notice") || q.get("feedback")) history.replaceState(null, "", location.pathname);
      const id = new URLSearchParams(location.search).get("p");
      const hit = id && list.find((p) => p.id === id);
      if (hit) setOpen(hit);
      else if (!id) {
        let savedOpen: string | null = null;
        try {
          savedOpen = sessionStorage.getItem("modu.open");
        } catch {
          /* 무시 */
        }
        const restored = savedOpen && !q.get("tab") && !q.get("room") && !q.get("feedback") ? list.find((p) => p.id === savedOpen) : null;
        if (restored) setOpen(restored);
      }
      setScreenRestored(true);
    });
    try {
      if (sessionStorage.getItem("modu.preview") === "1") setPreviewState(true);
    } catch {
      /* 무시 */
    }
    setSharedPost(new URLSearchParams(location.search).get("p") ?? "");
    api<{ enabled: boolean; user: User | null }>("/api/auth").then((r) => {
      setEnabled(!!r.data.enabled);
      setUser(r.data.user ?? null);
      setChecked(true);
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
    const id = setInterval(() => document.visibilityState === "visible" && loadThreads(), 30000);
    return () => clearInterval(id);
  }, [user, loadThreads, loadPosts]);

  // 다른 사람이 새로 올린 글이 보이도록, 화면이 켜져 있으면 60초마다, 앱으로 돌아오면 바로 목록을 새로 받는다.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && loadPosts();
    const id = setInterval(tick, 60000);
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
    // 글자가 길수록 오래 보여 준다(최소 3.4초)
    const id = setTimeout(() => setToastMsg(""), Math.max(3400, toastMsg.length * 80));
    return () => clearTimeout(id);
  }, [toastMsg]);

  // 로딩 화면은 짧게 보인다: 최소 0.8초, 준비가 늦어도 최대 3초 뒤에는 넘어간다.
  const [splashMinDone, setSplashMinDone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSplashMinDone(true), 800);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setSplashTimedOut(true), 3000);
    return () => clearTimeout(id);
  }, []);
  const booted = checked && loaded && screenRestored;
  // 본문을 보여도 되는 시점: 준비가 끝났거나 3초가 지났을 때. 같은 탭에서 처음 본 뒤에는 표시 기록을 남긴다.
  useEffect(() => {
    if (!(booted || splashTimedOut)) return;
    document.documentElement.setAttribute("data-ready", "1");
    if (!booted) return;
    try {
      sessionStorage.setItem("modu.seen", "1");
    } catch {
      /* 무시 */
    }
  }, [booted, splashTimedOut]);
  useEffect(() => {
    if (booted && splashMinDone) setSplashGone(true);
  }, [booted, splashMinDone]);

  // 희망 선택을 아직 하지 않은 회원(가입 직후 포함)에게 한 번 묻는다.
  useEffect(() => {
    if (user && !user.test && user.interests == null) setPickInterests(true);
  }, [user]);


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
    const reg = (r.ok && r.data.posts.find((p) => p.regular)) || null;
    // 이미 정기카풀이 있으면 바로 고치는 창, 없으면 출발지·도착지부터 묻는다.
    if (reg) setCommute({ post: reg, onboarding: false });
    else setCommuteStart(true);
  };
  /** 출발지·도착지를 고른 뒤 전체 출퇴근 창을 연다. */
  const commuteNext = (origin: Place, dest: Place) => {
    setCommuteStart(false);
    setCommute({ post: null, onboarding: joinFlow, prefill: { origin, dest } });
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

  // 둘러보다가 로그인이 필요한 동작을 하면 첫 화면(로그인·가입)을 다시 띄운다. 보던 글은 그대로 둔다.
  const goLogin = () => {
    if (enabled) setPreview(false);
    else {
      setOpen(null);
      setTab("me");
    }
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
    { id: "subway", label: t("지하철"), icon: Icon.train, block: "N005" },
    { id: "chat", label: t("채팅"), icon: Icon.chat, block: "N003" },
    { id: "me", label: t("내 정보"), icon: Icon.user, block: "N004" },
  ];
  const navTabs = tabs.filter((x) => x.id !== "subway" || seatVisible);

  return (
    <LangContext.Provider value={lang}>
      <HintContext.Provider value={{ on: !!user, texts: bubbleTexts }}>
      <div id="app-shell" className="mx-auto flex min-h-dvh max-w-md flex-col">
        {user?.test && (
          <p data-block-id="C090" data-block-name="테스트 회원 안내" className="flex items-center justify-between gap-3 border-b border-line bg-accentSoft px-5 py-2 text-[13px] text-ink">
            <span>테스트 회원 <b>{user.name}</b> 화면으로 보는 중</span>
            <a href="/admin" className="shrink-0 font-semibold text-accent underline">관리자로 돌아가기</a>
          </p>
        )}
        {user && <VerifyBanner user={user} toast={setToastMsg} />}
        <header className="flex items-start gap-3 px-5 pb-2 pt-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white">{Icon.car(1.8)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold leading-tight">{t("모두의카풀")}</p>
            <p className="text-[13px] leading-tight text-sub">{t(slogan)}</p>
          </div>
          {tab === "home" && <RoleSwitch user={user ?? null} onUser={setUser} toast={setToastMsg} onGoProfile={() => { setOpen(null); setTab("me"); }} />}
        </header>
        {tab === "home" && <div className="px-4"><Banners /></div>}
        {tab === "home" && <div className="flex justify-end px-5 pb-1"><Bubble blockId="C930" align="right">{t("지금 내 기본 역할이에요. 누르면 운전자와 탑승자가 바뀌고, 카풀을 올릴 때 기본값이 돼요.")}</Bubble></div>}

        <main className="flex-1 px-4 pb-28 pt-3">
          {tab === "home" &&
            (loaded ? <Home posts={posts} sample={sample} onOpen={setOpen} toast={setToastMsg} onRefresh={refresh} onGoProfile={() => { setOpen(null); setTab("me"); }} onPost={() => setTab("post")} /> : <div className="h-72 animate-pulse rounded-3xl bg-white" aria-hidden />)}
          {tab === "post" && <PostForm user={user} enabled={enabled} goLogin={goLogin} toast={setToastMsg} onRegular={openRegular} onDone={async (id) => { await refresh(); setTab("home"); if (!id) return; const r = await api<{ posts: Post[] }>("/api/posts?mine=1"); const made = r.ok && r.data.posts.find((p) => p.id === id); if (made) setOpen(made); }} />}
          {tab === "subway" && seatVisible && <SubwayTab user={user ?? null} toast={setToastMsg} />}
          {tab === "chat" && <Chat user={user} enabled={enabled} threads={threads} onChanged={loadThreads} goLogin={goLogin} openChat={openChat} openPost={async (postId) => {
            // 받은 신청: 내 글 목록에서 찾아 글 상세(수락·거절 버튼)를 연다.
            const r = await api<{ posts: Post[] }>("/api/posts?mine=1");
            const hit = r.ok ? r.data.posts.find((p) => p.id === postId) : undefined;
            if (hit) setOpen(hit);
            else setToastMsg(t("글을 찾을 수 없어요."));
          }} push={push} toast={setToastMsg} />}
          {tab === "me" && <Me user={user} enabled={enabled} setUser={(u) => { setUser(u); if (!u) setPreview(false); }} setLang={setLang} onOpen={setOpen} version={version} toast={setToastMsg} onCommute={(post, onboarding) => setCommute({ post, onboarding })} onChanged={refresh} onProfile={setMember} feedbackFirst={feedbackFirst} onEdit={(p) => (p.regular ? setCommute({ post: p, onboarding: false }) : setEditing(p))} push={push} />}
        </main>

        <nav aria-label={t("하단 메뉴")} className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
          <ul className={`mx-auto grid max-w-md ${navTabs.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
            {navTabs.map((x) => {
              const on = tab === x.id;
              return (
                <li key={x.id}>
                  <button data-block-id={x.block} data-block-name={x.label} aria-current={on ? "page" : undefined} onClick={() => { setTab(x.id); if (x.id === "home") loadPosts(); if (x.id === "chat" && user) loadThreads(); }} className={`relative flex w-full flex-col items-center gap-0.5 py-2.5 text-xs ${on ? "font-semibold text-accent" : "text-sub"}`}>
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
        {pickInterests && user && (
          <Interests
            onSaved={(u, picked) => {
              setUser(u);
              setPickInterests(false);
              // 다음은 출퇴근 정보 선택: 출퇴근이면 경로·시간·금액을 받고, 아니면 기타로 끝낸다.
              setJoinFlow(true);
              setCommuteStart(true);
            }}
          />
        )}
        {commuteStart && joinFlow && <CommuteOnboard user={user} toast={setToastMsg} onDone={(msg) => { setCommuteStart(false); setJoinFlow(false); setToastMsg(msg); refresh(); setTab("home"); }} />}
        {commuteStart && !joinFlow && <CommuteStart onNext={commuteNext} onClose={() => setCommuteStart(false)} toast={setToastMsg} />}
        {commute && <CommuteSheet user={user} initial={commute.post} prefill={commute.prefill} onboarding={commute.onboarding} onClose={() => setCommute(null)} toast={setToastMsg} onDone={() => { setCommute(null); setJoinFlow(false); refresh(); setTab("home"); }} />}
        {room && <ChatRoom thread={room} onClose={() => { setRoom(null); loadThreads(); }} toast={setToastMsg} onChanged={refresh} onProfile={setMember} onReport={(userId, name, requestId) => setWhy({ mode: "report", userId, name, requestId })} onBlock={(userId, name) => setWhy({ mode: "block", userId, name })} />}
        {member && <MemberSheet userId={member} onClose={() => setMember(null)} toast={setToastMsg} onReport={(userId, name) => setWhy({ mode: "report", userId, name })} onBlock={(userId, name) => setWhy({ mode: "block", userId, name })} />}
        {enabled && checked && !user && !preview && !resetToken && !withdrawToken && (
          <Gate
            setUser={(u) => {
              setUser(u);
              setPreview(false);
            }}
            toast={setToastMsg}
            onCommute={() => setCommute({ post: null, onboarding: true })}
            push={push}
            onPreview={() => setPreview(true)}
            setLang={setLang}
            sharedPost={sharedPost}
          />
        )}
        {!splashTimedOut && !splashGone && <Splash />}
        {!booted && !splashTimedOut && <TopLoading />}
        <NoticePopup userId={user?.id ?? null} focus={noticeFocus} />
        {user && user.consented === false && !user.test && !consentLater && <ConsentSheet setUser={setUser} onClose={() => setConsentLater(true)} toast={setToastMsg} />}
        {withdrawToken && <Withdraw token={withdrawToken} onClose={() => setWithdrawToken("")} />}
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
          <div role="status" aria-live="polite" data-block-id="C099" data-block-name="알림 문구" className="fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-accent px-5 py-4 text-left text-[16px] font-semibold leading-snug text-white shadow-[0_12px_32px_rgba(47,107,255,0.35)] ring-4 ring-accentSoft">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.22)" stroke="none" /><path d="M12 11v5.5" /><path d="M12 7.5h.01" /></svg>
            <span className="min-w-0 flex-1 break-keep">{toastMsg}</span>
          </div>
        )}
      </div>
      </HintContext.Provider>
    </LangContext.Provider>
  );
}
