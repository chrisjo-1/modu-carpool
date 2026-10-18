"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import ReportChat from "@/components/admin/ReportChat";
import MemberCode from "@/components/admin/MemberCode";
import AdminMail from "@/components/admin/Mail";
import AdminSend from "@/components/admin/Send";
import AdminSubway from "@/components/admin/Subway";
import { JOIN_SOURCES } from "@/lib/types";

/** 마지막 접속을 '방금·n분 전·n시간 전'으로 */
const lastSeenText = (ms: number) => {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  if (min < 60 * 24 * 7) return `${Math.floor(min / 60 / 24)}일 전`;
  return new Date(ms).toLocaleDateString("ko-KR");
};

const Legacy = dynamic(() => import("@/components/admin/Legacy"), { ssr: false });
const Credits = dynamic(() => import("@/components/admin/Credits"), { ssr: false });
const AdminNotices = dynamic(() => import("@/components/admin/Notices"), { ssr: false });
const AdminKeywords = dynamic(() => import("@/components/admin/Keywords"), { ssr: false });
const AdminFeedback = dynamic(() => import("@/components/admin/Feedback"), { ssr: false });
const AdminHelp = dynamic(() => import("@/components/admin/Help"), { ssr: false });
const AdminStats = dynamic(() => import("@/components/admin/Stats"), { ssr: false });
const AdminDocs = dynamic(() => import("@/components/admin/Docs"), { ssr: false });
const AdminRadius = dynamic(() => import("@/components/admin/Radius"), { ssr: false });
const AdminSite = dynamic(() => import("@/components/admin/Site"), { ssr: false });
const AdminBanners = dynamic(() => import("@/components/admin/Banners"), { ssr: false });
const AdminBubbles = dynamic(() => import("@/components/admin/Bubbles"), { ssr: false });
const AdminCallHistory = dynamic(() => import("@/components/admin/CallHistory"), { ssr: false });
const AdminDemo = dynamic(() => import("@/components/admin/Demo"), { ssr: false });

type PostRow = { id: string; origin: string; dest: string; depart_at: number; role: string; kind: string; cost: string; price: number; regular: boolean; days: string; time_go: string; status: string; note: string; email: string; name: string; blocked: boolean; test: boolean };
type UserRow = {
  id: string; email: string; name: string; member_code: string; blocked: boolean; test: boolean; credits: number; created_at: number; lastSeen: number | null; posts: number; tier: string; tier_set: string;
  bio: string; contact: string; contact_type: string; gender: string; role_pref: string; join_source: string; car_no: string; car_v: number; photo: string; carPhoto: string;
  interests: string[] | null; driver_posts: number; rider_posts: number;
  commute_kind: string; commute_origin: string; commute_dest: string; commute_time: string; commute_price: number;
};
const ROLE_LABEL: Record<string, string> = { driver: "운전자", rider: "탑승자", "": "미입력" };
const JOIN_LABEL: Record<string, string> = Object.fromEntries(JOIN_SOURCES);
const GENDER_LABEL: Record<string, string> = { female: "여", male: "남", "": "미입력" };
type Flag = { id: string; reason: string; detail: string; status?: string; created_at: number; target_id: string; target_name: string; target_email: string; target_blocked: boolean };
type ReportRow = Flag & { reporter_name: string; reporter_email: string };
type BlockRow = Flag & { blocker_name: string; blocker_email: string };
type Info = { db: boolean; stats: { users: number; blocked: number; posts: number; requests: number; accepted: number; reports: number } | null; posts: PostRow[]; users: UserRow[]; reports: ReportRow[]; blocks: BlockRow[] };
type TabId = "stats" | "posts" | "users" | "flags" | "legacy" | "credits" | "notices" | "keywords" | "feedback" | "docs" | "radius" | "calls" | "site" | "demo" | "help" | "mail" | "send" | "subway";
const REASON: Record<string, string> = { noshow: "노쇼", rude: "비매너", photo: "타인 사진", promo: "홍보성", illegal: "불법", etc: "기타" };
const TIER_NAME: Record<string, string> = { bronze: "브론즈", silver: "실버", gold: "골드" };

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const day = (ms: number) => new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const call = (method: string, url: string, data?: unknown) =>
  fetch(url, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });

export default function Admin() {
  const [state, setState] = useState<"loading" | "gate" | "in">("loading");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [tab, setTab] = useState<TabId>("posts");
  const [q, setQ] = useState("");
  const [gen, setGen] = useState("");
  const [roleF, setRoleF] = useState("");
  const [member, setMember] = useState<UserRow | null>(null);
  const [edit, setEdit] = useState<PostRow | null>(null);
  const [testName, setTestName] = useState("");
  const [withTest, setWithTest] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  const refresh = useCallback(async (query = "") => {
    const a = await fetch(`/api/admin?q=${encodeURIComponent(query)}`).then((r) => r.json()).catch(() => ({ admin: false }));
    if (!a.admin) return setState("gate");
    setInfo({ db: !!a.db, stats: a.stats ?? null, posts: a.posts ?? [], users: a.users ?? [], reports: a.reports ?? [], blocks: a.blocks ?? [] });
    setState("in");
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const res = await call("POST", "/api/admin", { password });
    if (!res.ok) return setMsg((await res.json()).error ?? "실패");
    setPassword("");
    refresh();
  };

  const act = async (res: Promise<Response>, done: string) => {
    const r = await res;
    setMsg(r.ok ? done : (await r.json().catch(() => ({}))).error ?? "처리하지 못했습니다.");
    refresh(q);
  };

  const removePost = (p: PostRow) => {
    if (window.confirm(`"${p.origin} → ${p.dest}" 글을 삭제할까요? 신청과 대화도 함께 지워집니다.`)) act(call("DELETE", `/api/admin?post=${p.id}`), "글을 삭제했습니다.");
  };
  const blockTarget = async (f: Flag) => {
    if (!window.confirm(`${f.target_name || f.target_email} 회원을 이용 정지할까요? 로그인과 글쓰기가 막힙니다. 회원에게 정지 안내 메일이 발송됩니다.`)) return;
    const r = await call("PATCH", "/api/admin", { userId: f.target_id, blocked: true, notify: true, reason: REASON[f.reason] ?? "" });
    const d = await r.json().catch(() => ({}));
    setMsg(!r.ok ? d.error ?? "처리하지 못했습니다." : d.mailed === false ? "이용을 정지했습니다. 안내 메일은 보내지 못했어요(메일 설정 확인)." : "이용을 정지하고 안내 메일을 보냈습니다.");
    refresh(q);
  };
  const removeTargetPhoto = (f: Flag) => {
    if (window.confirm(`${f.target_name || f.target_email} 회원의 프로필 사진을 삭제할까요?`)) act(call("PATCH", "/api/admin", { userId: f.target_id, removePhoto: true }), "프로필 사진을 삭제했습니다.");
  };
  const who = (name: string, email: string) => (<>{name || "—"} <span className="block text-xs text-sub">{email}</span></>);
  const why = (f: Flag) => (<><b>{REASON[f.reason] ?? (f.reason || "사유 없음")}</b>{f.detail && <span className="block max-w-[280px] whitespace-pre-wrap text-xs text-sub">{f.detail}</span>}</>);
  const stop = (f: Flag) => (
    <span className="flex flex-wrap gap-x-3">
      {f.reason === "photo" && <button data-block-id="B096" data-block-name="신고 사진 삭제" className="min-h-0 text-sub underline" onClick={() => removeTargetPhoto(f)}>사진 삭제</button>}
      {f.target_blocked ? <span className="text-warn">정지됨</span> : <button data-block-id="B095" data-block-name="이용 정지" className="min-h-0 text-warn underline" onClick={() => blockTarget(f)}>이용 정지</button>}
    </span>
  );
  const makeTest = async (e: React.FormEvent) => {
    e.preventDefault();
    await act(call("POST", "/api/admin", { action: "testUser", name: testName }), "테스트 회원을 만들었습니다.");
    setTestName("");
  };
  const enter = async (u: UserRow) => {
    const r = await call("POST", "/api/admin", { action: "enter", userId: u.id });
    if (r.ok) window.location.href = "/";
    else setMsg((await r.json().catch(() => ({}))).error ?? "들어가지 못했습니다.");
  };
  const removeUser = (u: UserRow) => {
    const label = u.name || u.email;
    const msg = u.test
      ? `테스트 회원 ${label}을(를) 삭제할까요?`
      : `${label} 회원을 삭제할까요? 회원의 글·신청·대화·크레딧 기록이 모두 지워지며 되돌릴 수 없어요.`;
    if (window.confirm(msg)) act(call("DELETE", `/api/admin?user=${u.id}`), "회원을 삭제했습니다.").then(() => setMember((m) => (m?.id === u.id ? null : m)));
  };
  const toggleBlock = (u: UserRow) => {
    const next = !u.blocked;
    if (window.confirm(next ? `${u.name || u.email} 회원을 차단할까요? 로그인과 글쓰기가 막히고 올린 글이 목록에서 사라집니다.` : `${u.name || u.email} 회원의 차단을 풀까요?`))
      act(call("PATCH", "/api/admin", { userId: u.id, blocked: next }), next ? "차단했습니다." : "차단을 풀었습니다.");
  };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    await act(call("PATCH", "/api/admin", { postId: edit.id, origin: edit.origin, dest: edit.dest, note: edit.note, status: edit.status }), "글을 수정했습니다.");
    setEdit(null);
  };

  if (state === "loading") return <main className="p-8 text-sub">불러오는 중…</main>;

  if (state === "gate")
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="text-2xl font-bold">모두의카풀 관리자</h1>
        <form onSubmit={login} className="mt-6 space-y-3" data-block-id="S090" data-block-name="관리자 로그인">
          <label className="block text-sm text-sub">
            관리자 비밀번호
            <input className={`${input} mt-1 py-3`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
          <button className="w-full rounded-xl bg-accent py-3 font-semibold text-white">들어가기</button>
        </form>
        <a href="/" className="mt-6 flex items-center text-sm text-sub underline">← 모두의카풀로 돌아가기</a>
      </main>
    );

  const s = info?.stats;
  const tabBtn = (id: TabId, label: string) => (
    <button onClick={() => { setTab(id); refresh(q); }} aria-pressed={tab === id} className={`rounded-xl px-4 text-[15px] ${tab === id ? "bg-accent font-semibold text-white" : "bg-white text-sub shadow-card"}`}>{label}</button>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">모두의카풀 관리자</h1>
        <div className="flex gap-2">
          <a href="/" className="flex items-center rounded-xl bg-white px-4 text-sm text-sub shadow-card">사이트 보기</a>
          <button className="rounded-xl bg-white px-4 text-sm text-sub shadow-card" onClick={async () => { await call("DELETE", "/api/admin"); setState("gate"); }}>나가기</button>
        </div>
      </div>

      <section data-block-id="S091" data-block-name="현황" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["가입 회원", s ? `${s.users.toLocaleString()}명` : "—"],
          ["차단 회원", s ? `${s.blocked.toLocaleString()}명` : "—"],
          ["카풀 글", s ? `${s.posts.toLocaleString()}건` : "—"],
          ["신청", s ? `${s.requests.toLocaleString()}건` : "—"],
          ["수락된 매칭", s ? `${s.accepted.toLocaleString()}건` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="text-sm text-sub">{k}</p>
            <p className="num mt-1 text-xl font-bold">{v}</p>
          </div>
        ))}
      </section>
      {!info?.db && <p className="rounded-xl bg-warnSoft px-4 py-3 text-sm text-warn">DB가 아직 연결되지 않았습니다. 연결 전에는 현황과 관리 기능이 동작하지 않습니다.</p>}

      <div className="flex flex-wrap items-center gap-2">
        {tabBtn("stats", "통계")}
        {tabBtn("posts", "카풀 글")}
        {tabBtn("users", "회원")}
        {tabBtn("flags", `신고·차단${s?.reports ? ` (${s.reports})` : ""}`)}
        {tabBtn("feedback", "의견")}
        {tabBtn("notices", "공지")}
        {tabBtn("keywords", "키워드")}
        {tabBtn("credits", "크레딧")}
        {tabBtn("docs", "약관")}
        {tabBtn("radius", "반경")}
        {tabBtn("calls", "CALL")}
        {tabBtn("site", "사이트")}
        {tabBtn("demo", "임시글")}
        {tabBtn("help", "도움말")}
        {tabBtn("mail", "메일")}
        {tabBtn("send", "발송")}
        {tabBtn("subway", "지하철")}
        {tabBtn("legacy", "구 워프 회원 이전")}
        {msg && <p role="status" className="ml-2 text-sm text-sub">{msg}</p>}
      </div>

      {tab === "posts" && (
        <section data-block-id="S092" data-block-name="글 관리" className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <h2 className="text-lg font-semibold">최근 카풀 글</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-sub">
                <tr>{["경로", "일정", "구분", "상태", "작성자", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(info?.posts ?? []).map((p) => (
                  <tr key={p.id} className={p.blocked ? "opacity-50" : ""}>
                    <td className="px-2 py-2">{p.origin} → {p.dest}{p.note && <span className="block max-w-[260px] truncate text-xs text-sub">{p.note}</span>}</td>
                    <td className="num px-2 py-2">{p.regular ? `정기 ${p.days} ${p.time_go}` : day(p.depart_at)}</td>
                    <td className="px-2 py-2">{p.role === "driver" ? "운전자" : "탑승자"} · {p.cost === "fixed" ? `${p.price.toLocaleString()}원` : p.cost === "meter" ? "비용 나눔" : "무료"}</td>
                    <td className="px-2 py-2">{p.status === "open" ? "모집 중" : p.status === "progress" ? "카풀 진행 중" : "마감"}{!p.regular && p.depart_at < Date.now() - 2 * 3600_000 && <span className="ml-1 text-xs text-sub">(출발 지남)</span>}</td>
                    <td className="px-2 py-2">{p.name} <span className="text-sub">{p.email}</span>{p.blocked && <span className="ml-1 text-warn">차단됨</span>}{p.test && <span className="ml-1 rounded-full bg-accentSoft px-2 py-0.5 text-xs font-semibold text-accent">테스트 · 실제 회원에게 안 보임</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <button data-block-id="B091" data-block-name="글 수정" className="mr-3 min-h-0 text-accent underline" onClick={() => setEdit({ ...p })}>수정</button>
                      <button data-block-id="B092" data-block-name="글 삭제" className="min-h-0 text-warn underline" onClick={() => removePost(p)}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(info?.posts ?? []).length === 0 && <p className="py-6 text-center text-sub">글이 없습니다.</p>}
          </div>
        </section>
      )}

      {tab === "users" && (() => {
        const rows = (info?.users ?? []).filter((u) => (withTest || !u.test) && (!gen || u.gender === gen) && (!roleF || (roleF === "none" ? u.role_pref === "" : u.role_pref === roleF)));
        return (
        <section data-block-id="S093" data-block-name="회원 관리" className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">회원 <span className="text-sm font-normal text-sub">{rows.length}명 표시</span></h2>
            <form onSubmit={(e) => { e.preventDefault(); refresh(q); }} className="flex gap-2">
              <input data-block-id="F090" className={`${input} w-56`} type="search" placeholder="이메일·닉네임 검색" aria-label="회원 검색" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="rounded-lg bg-bg px-4 text-sm">검색</button>
              <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-sub"><input type="checkbox" checked={withTest} onChange={(e) => setWithTest(e.target.checked)} />테스트 회원 포함</label>
            </form>
          </div>
          <div data-block-id="A205" data-block-name="회원 필터" className="mt-3 flex flex-wrap gap-2 text-sm">
            <select data-block-id="F092" aria-label="성별 필터" className={`${input} w-auto`} value={gen} onChange={(e) => setGen(e.target.value)}>
              <option value="">성별: 전체</option>
              <option value="female">여</option>
              <option value="male">남</option>
            </select>
            <select data-block-id="F093" aria-label="역할 필터" className={`${input} w-auto`} value={roleF} onChange={(e) => setRoleF(e.target.value)}>
              <option value="">역할: 전체</option>
              <option value="driver">운전자</option>
              <option value="rider">탑승자</option>
              <option value="none">미입력</option>
            </select>
            {(gen || roleF) && <button data-block-id="B099" className="rounded-lg bg-bg px-3 text-sub" onClick={() => { setGen(""); setRoleF(""); }}>필터 해제</button>}
          </div>
          {zoom && (
            <div role="dialog" aria-modal="true" aria-label="사진 크게 보기" className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4" onClick={() => setZoom(null)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoom.src} alt={zoom.alt} className="max-h-[85vh] max-w-[92vw] rounded-2xl bg-white object-contain" />
            </div>
          )}
          {member && (
            <div data-block-id="C231" data-block-name="회원 상세" className="mt-4 rounded-xl border border-line bg-bg p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold">{member.name || "—"} <span className="font-normal text-sub">{member.email}</span></p>
                <button data-block-id="B240" className="text-sub underline" onClick={() => setMember(null)}>닫기</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="mb-1 text-xs text-sub">프로필 사진</p>
                  {member.photo ? <img src={member.photo} alt="프로필 사진" onClick={() => setZoom({ src: member.photo, alt: "프로필 사진" })} className="h-28 w-28 cursor-zoom-in rounded-xl border border-line object-cover" /> : <p className="grid h-28 w-28 place-items-center rounded-xl border border-dashed border-line text-xs text-sub">없음</p>}
                </div>
                <div>
                  <p className="mb-1 text-xs text-sub">차량 사진</p>
                  {member.carPhoto ? <img src={member.carPhoto} alt="차량 사진" onClick={() => setZoom({ src: member.carPhoto, alt: "차량 사진" })} className="h-28 w-40 cursor-zoom-in rounded-xl border border-line object-cover" /> : <p className="grid h-28 w-40 place-items-center rounded-xl border border-dashed border-line text-xs text-sub">없음</p>}
                </div>
                <dl className="col-span-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 self-start">
                  <dt className="text-sub">최근 접속</dt><dd>{member.lastSeen ? lastSeenText(member.lastSeen) : "없음"}</dd>
                  <dt className="text-sub">희망 역할</dt><dd>{ROLE_LABEL[member.role_pref] ?? "미입력"}</dd>
                  <dt className="text-sub">가입 경로</dt><dd>{JOIN_LABEL[member.join_source] ?? "미입력"}</dd>
                  <dt className="text-sub">출퇴근 정보</dt><dd className="break-words">{member.commute_kind === "commute" ? `${member.commute_origin} → ${member.commute_dest} · ${member.commute_time} · ${member.commute_price.toLocaleString("ko-KR")}원` : member.commute_kind === "other" ? `기타 · ${member.commute_origin} → ${member.commute_dest}` : "미입력"}</dd>
                  <dt className="text-sub">글 기준</dt><dd>운전자 글 {member.driver_posts} · 탑승자 글 {member.rider_posts}</dd>
                  <dt className="text-sub">성별</dt><dd>{GENDER_LABEL[member.gender] ?? "미입력"}</dd>
                  <dt className="text-sub">차량번호</dt><dd>{member.car_no || "미등록"}</dd>
                  <dt className="text-sub">연락처</dt><dd>{member.contact ? `${member.contact_type || ""} ${member.contact}`.trim() : "없음"}</dd>
                  <dt className="text-sub">소개</dt><dd className="break-words">{member.bio || "없음"}</dd>
                  <dt className="text-sub">관심사</dt><dd>{member.interests?.length ? member.interests.join(", ") : "미선택"}</dd>
                </dl>
              </div>
              <MemberCode
                userId={member.id}
                current={member.member_code}
                onApplied={(code) => {
                  setMember((m) => (m ? { ...m, member_code: code, name: m.name === m.member_code ? code : m.name } : m));
                  setMsg("고유코드를 바꿨습니다.");
                  refresh(q);
                }}
              />
            </div>
          )}
          <form onSubmit={makeTest} data-block-id="S097" data-block-name="테스트 회원 만들기" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-bg p-3">
            <span className="text-sm font-semibold">테스트 회원</span>
            <input data-block-id="F091" className={`${input} w-48`} maxLength={20} placeholder="닉네임 (비우면 자동)" aria-label="테스트 회원 닉네임" value={testName} onChange={(e) => setTestName(e.target.value)} />
            <button data-block-id="B096" data-block-name="테스트 회원 만들기" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">만들기</button>
            <span className="text-xs text-sub">테스트 회원의 글도 실제 회원에게 그대로 보입니다.</span>
          </form>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-sub">
                <tr>{["프로필 사진", "닉네임", "이메일", "역할", "성별", "차량", "차량 사진", "운전자 등급", "가입일", "최근 접속", "글", "크레딧", "상태", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td className="px-2 py-2">{u.photo ? <img src={u.photo} alt="" loading="lazy" onClick={() => setZoom({ src: u.photo, alt: u.name })} className="h-9 w-9 cursor-zoom-in rounded-full border border-line object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-bg text-xs text-sub">없음</span>}</td>
                    <td className="px-2 py-2 font-medium">{u.name || "—"}{u.test && <span className="ml-2 rounded-full bg-accentSoft px-2 py-0.5 text-xs font-semibold text-accent">테스트</span>}</td>
                    <td className="px-2 py-2">{u.email}</td>
                    <td className="px-2 py-2">
                      <span className="block">희망 {ROLE_LABEL[u.role_pref] ?? "미입력"}</span>
                      <span className="block text-xs text-sub">운전자 {u.driver_posts} · 탑승자 {u.rider_posts}</span>
                    </td>
                    <td className="px-2 py-2">{GENDER_LABEL[u.gender] ?? "미입력"}</td>
                    <td className="px-2 py-2">{u.car_no ? <span className="text-accent">{u.car_no}</span> : <span className="text-sub">미등록</span>}</td>
                    <td className="px-2 py-2">{u.carPhoto ? <img src={u.carPhoto} alt="" loading="lazy" onClick={() => setZoom({ src: u.carPhoto, alt: `${u.name} 차량` })} className="h-9 w-12 cursor-zoom-in rounded-lg border border-line object-cover" /> : <span className="grid h-9 w-12 place-items-center rounded-lg bg-bg text-xs text-sub">없음</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="block">{u.tier ? <span className="font-semibold text-accent">{TIER_NAME[u.tier] ?? u.tier}</span> : <span className="text-sub">미부여</span>}</span>
                      <select
                        data-block-id="F150"
                        aria-label={`${u.name || u.email} 운전자 등급 지정`}
                        className="mt-1 rounded-lg border border-line bg-white px-1.5 py-1 text-xs"
                        value={u.tier_set || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const label = v ? TIER_NAME[v] : "자동(브론즈 조건)";
                          if (window.confirm(`${u.name || u.email} 회원의 운전자 등급을 '${label}'(으)로 바꿀까요?`)) act(call("PATCH", "/api/admin", { userId: u.id, tierSet: v }), "운전자 등급을 바꿨습니다.");
                        }}
                      >
                        <option value="">자동</option>
                        <option value="silver">실버 지정</option>
                        <option value="gold">골드 지정</option>
                      </select>
                    </td>
                    <td className="num px-2 py-2">{new Date(u.created_at).toLocaleDateString("ko-KR")}</td>
                    <td className="num whitespace-nowrap px-2 py-2">{u.lastSeen ? lastSeenText(u.lastSeen) : <span className="text-sub">없음</span>}</td>
                    <td className="num px-2 py-2">{u.posts}</td>
                    <td className="num px-2 py-2">{(u.credits ?? 0).toLocaleString("ko-KR")}</td>
                    <td className="px-2 py-2">{u.blocked ? <span className="font-semibold text-warn">차단됨</span> : "정상"}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <button data-block-id="B241" data-block-name="회원 상세 보기" className="mr-3 min-h-0 font-semibold text-accent underline" onClick={() => setMember(u)}>상세</button>
                      {u.test && <button data-block-id="B097" data-block-name="이 회원으로 들어가기" className="mr-3 min-h-0 font-semibold text-accent underline" onClick={() => enter(u)}>이 회원으로 들어가기</button>}
                      <button data-block-id="B098" data-block-name="회원 삭제" className="mr-3 min-h-0 text-sub underline" onClick={() => removeUser(u)}>삭제</button>
                      <button data-block-id="B093" data-block-name="차단" className={`min-h-0 underline ${u.blocked ? "text-accent" : "text-warn"}`} onClick={() => toggleBlock(u)}>{u.blocked ? "차단 해제" : "차단"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-6 text-center text-sub">회원이 없습니다.</p>}
            <p className="mt-3 text-xs text-sub">최근 가입 순으로 200명까지 보입니다. 성별·역할 필터는 불러온 회원 안에서 걸러집니다. 더 찾으려면 검색해 주세요.</p>
          </div>
        </section>
        );
      })()}

      {tab === "legacy" && <Legacy />}
      {tab === "credits" && <Credits />}
      {tab === "mail" && <AdminMail />}
      {tab === "send" && <AdminSend />}
      {tab === "subway" && <AdminSubway />}
      {tab === "notices" && <AdminNotices />}
      {tab === "keywords" && <AdminKeywords />}
      {tab === "feedback" && <AdminFeedback />}
      {tab === "help" && <AdminHelp />}
      {tab === "stats" && <AdminStats />}
      {tab === "calls" && <AdminCallHistory />}
      {tab === "site" && <><AdminSite /><AdminBanners /><AdminBubbles /></>}
      {tab === "docs" && <AdminDocs />}
      {tab === "radius" && <AdminRadius />}
      {tab === "demo" && <AdminDemo />}

      {tab === "flags" && (
        <>
          <section data-block-id="S095" data-block-name="신고 내역" className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold">신고 내역</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-sub"><tr>{["신고한 회원", "신고당한 회원", "사유", "일시", "상태", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {(info?.reports ?? []).map((r) => (
                    <tr key={r.id} className={r.status === "done" ? "opacity-60" : ""}>
                      <td className="px-2 py-2">{who(r.reporter_name, r.reporter_email)}</td>
                      <td className="px-2 py-2">{who(r.target_name, r.target_email)}</td>
                      <td className="px-2 py-2">{why(r)}</td>
                      <td className="num px-2 py-2">{day(r.created_at)}</td>
                      <td className="px-2 py-2">{r.status === "done" ? "처리 완료" : <span className="font-semibold text-warn">확인 필요</span>}</td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <button data-block-id="B094" data-block-name="신고 처리" className="mr-3 min-h-0 text-accent underline" onClick={() => act(call("PATCH", "/api/admin", { reportId: r.id, status: r.status === "done" ? "open" : "done" }), "신고 상태를 바꿨습니다.")}>{r.status === "done" ? "다시 열기" : "처리 완료"}</button>
                        <ReportChat reportId={r.id} />
                        {stop(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(info?.reports ?? []).length === 0 && <p className="py-6 text-center text-sub">신고가 없습니다.</p>}
            </div>
          </section>
          <section data-block-id="S096" data-block-name="회원 간 차단" className="rounded-2xl border border-line bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold">회원 간 차단</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-sub"><tr>{["차단한 회원", "차단당한 회원", "사유", "일시", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {(info?.blocks ?? []).map((k, i) => (
                    <tr key={k.id ?? i}>
                      <td className="px-2 py-2">{who(k.blocker_name, k.blocker_email)}</td>
                      <td className="px-2 py-2">{who(k.target_name, k.target_email)}</td>
                      <td className="px-2 py-2">{why(k)}</td>
                      <td className="num px-2 py-2">{day(k.created_at)}</td>
                      <td className="px-2 py-2">{stop(k)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(info?.blocks ?? []).length === 0 && <p className="py-6 text-center text-sub">차단 내역이 없습니다.</p>}
            </div>
          </section>
        </>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-label="글 수정">
          <form onSubmit={saveEdit} data-block-id="S094" data-block-name="글 수정" className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-card">
            <h2 className="text-lg font-semibold">글 수정</h2>
            <label className="block text-sm text-sub">출발지<input className={`${input} mt-1`} required minLength={2} maxLength={60} value={edit.origin} onChange={(e) => setEdit({ ...edit, origin: e.target.value })} /></label>
            <label className="block text-sm text-sub">도착지<input className={`${input} mt-1`} required minLength={2} maxLength={60} value={edit.dest} onChange={(e) => setEdit({ ...edit, dest: e.target.value })} /></label>
            <label className="block text-sm text-sub">남긴 말<textarea className={`${input} mt-1`} rows={3} maxLength={300} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            <label className="block text-sm text-sub">
              상태
              <select className={`${input} mt-1`} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                <option value="open">모집 중</option>
                {edit.status === "progress" && <option value="progress">카풀 진행 중</option>}
                <option value="closed">마감</option>
              </select>
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" className="flex-1 rounded-xl bg-bg py-3" onClick={() => setEdit(null)}>취소</button>
              <button className="flex-1 rounded-xl bg-accent py-3 font-semibold text-white">저장</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
