"use client";
import { useCallback, useEffect, useState } from "react";

type PostRow = { id: string; origin: string; dest: string; depart_at: number; role: string; kind: string; cost: string; price: number; regular: boolean; days: string; time_go: string; status: string; note: string; email: string; name: string; blocked: boolean };
type UserRow = { id: string; email: string; name: string; blocked: boolean; created_at: number; posts: number };
type Info = { db: boolean; stats: { users: number; blocked: number; posts: number; requests: number; accepted: number } | null; posts: PostRow[]; users: UserRow[] };

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const day = (ms: number) => new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const call = (method: string, url: string, data?: unknown) =>
  fetch(url, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });

export default function Admin() {
  const [state, setState] = useState<"loading" | "gate" | "in">("loading");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [tab, setTab] = useState<"posts" | "users">("posts");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<PostRow | null>(null);

  const refresh = useCallback(async (query = "") => {
    const a = await fetch(`/api/admin?q=${encodeURIComponent(query)}`).then((r) => r.json()).catch(() => ({ admin: false }));
    if (!a.admin) return setState("gate");
    setInfo({ db: !!a.db, stats: a.stats ?? null, posts: a.posts ?? [], users: a.users ?? [] });
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
  const tabBtn = (id: "posts" | "users", label: string) => (
    <button onClick={() => setTab(id)} aria-pressed={tab === id} className={`rounded-xl px-4 text-[15px] ${tab === id ? "bg-accent font-semibold text-white" : "bg-white text-sub shadow-card"}`}>{label}</button>
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

      <div className="flex items-center gap-2">
        {tabBtn("posts", "카풀 글")}
        {tabBtn("users", "회원")}
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
                    <td className="px-2 py-2">{p.status === "open" ? "모집 중" : "마감"}</td>
                    <td className="px-2 py-2">{p.name} <span className="text-sub">{p.email}</span>{p.blocked && <span className="ml-1 text-warn">차단됨</span>}</td>
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

      {tab === "users" && (
        <section data-block-id="S093" data-block-name="회원 관리" className="rounded-2xl border border-line bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">회원</h2>
            <form onSubmit={(e) => { e.preventDefault(); refresh(q); }} className="flex gap-2">
              <input data-block-id="F090" className={`${input} w-56`} type="search" placeholder="이메일·닉네임 검색" aria-label="회원 검색" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="rounded-lg bg-bg px-4 text-sm">검색</button>
            </form>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-sub">
                <tr>{["닉네임", "이메일", "가입일", "글", "상태", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(info?.users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="px-2 py-2 font-medium">{u.name || "—"}</td>
                    <td className="px-2 py-2">{u.email}</td>
                    <td className="num px-2 py-2">{new Date(u.created_at).toLocaleDateString("ko-KR")}</td>
                    <td className="num px-2 py-2">{u.posts}</td>
                    <td className="px-2 py-2">{u.blocked ? <span className="font-semibold text-warn">차단됨</span> : "정상"}</td>
                    <td className="px-2 py-2">
                      <button data-block-id="B093" data-block-name="차단" className={`min-h-0 underline ${u.blocked ? "text-accent" : "text-warn"}`} onClick={() => toggleBlock(u)}>{u.blocked ? "차단 해제" : "차단"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(info?.users ?? []).length === 0 && <p className="py-6 text-center text-sub">회원이 없습니다.</p>}
            <p className="mt-3 text-xs text-sub">최근 가입 순으로 200명까지 보입니다. 더 찾으려면 검색해 주세요.</p>
          </div>
        </section>
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
