"use client";
import { useEffect, useState } from "react";

type Row = { id: string; origin: string; dest: string; depart_at: number; role: string; kind: string; cost: string; status: string; email: string; name: string };
type Info = { db: boolean; stats: { users: number; posts: number; requests: number; accepted: number } | null; posts: Row[] };

export default function Admin() {
  const [state, setState] = useState<"loading" | "gate" | "in">("loading");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<Info | null>(null);

  const refresh = async () => {
    const a = await fetch("/api/admin").then((r) => r.json()).catch(() => ({ admin: false }));
    if (!a.admin) return setState("gate");
    setInfo({ db: !!a.db, stats: a.stats ?? null, posts: a.posts ?? [] });
    setState("in");
  };
  useEffect(() => {
    refresh();
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!res.ok) return setMsg((await res.json()).error ?? "실패");
    setPassword("");
    refresh();
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 글을 삭제할까요? 신청과 대화도 함께 지워집니다.")) return;
    await fetch(`/api/admin?post=${id}`, { method: "DELETE" });
    refresh();
  };

  if (state === "loading") return <main className="p-8 text-sub">불러오는 중…</main>;

  if (state === "gate")
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="text-2xl font-bold">모두의카풀 관리자</h1>
        <form onSubmit={login} className="mt-6 space-y-3" data-block-id="S090" data-block-name="관리자 로그인">
          <label className="block text-sm text-sub">
            관리자 비밀번호
            <input className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-3 outline-none focus:border-accent" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
          <button className="w-full rounded-xl bg-accent py-3 font-semibold text-white">들어가기</button>
        </form>
      </main>
    );

  const s = info?.stats;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">모두의카풀 관리자</h1>
        <button className="rounded-xl bg-white px-4 text-sm text-sub shadow-card" onClick={async () => { await fetch("/api/admin", { method: "DELETE" }); setState("gate"); }}>나가기</button>
      </div>

      <section data-block-id="S091" data-block-name="현황" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["가입 회원", s ? `${s.users.toLocaleString()}명` : "—"],
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
      {!info?.db && <p className="rounded-xl bg-warnSoft px-4 py-3 text-sm text-warn">DB가 아직 연결되지 않았습니다. 연결 전에는 현황과 글 관리가 동작하지 않습니다.</p>}

      <section data-block-id="S092" data-block-name="글 관리" className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold">최근 카풀 글</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-sub">
              <tr>{["경로", "출발", "구분", "상태", "작성자", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(info?.posts ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="px-2 py-2">{p.origin} → {p.dest}</td>
                  <td className="num px-2 py-2">{new Date(p.depart_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                  <td className="px-2 py-2">{p.role === "driver" ? "운전자" : "탑승자"} · {p.kind === "commute" ? "출퇴근" : "나들이"} · {p.cost === "meter" ? "비용 나눔" : "무료"}</td>
                  <td className="px-2 py-2">{p.status === "open" ? "모집 중" : "마감"}</td>
                  <td className="px-2 py-2">{p.name} <span className="text-sub">{p.email}</span></td>
                  <td className="px-2 py-2"><button className="min-h-0 text-warn underline" onClick={() => remove(p.id)}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(info?.posts ?? []).length === 0 && <p className="py-6 text-center text-sub">글이 없습니다.</p>}
        </div>
      </section>
    </main>
  );
}
