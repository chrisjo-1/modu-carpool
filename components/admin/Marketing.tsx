"use client";
import { useEffect, useState } from "react";

type Copies = { url: string; naver: string; instagram: string; threads: string; x: string };
type Post = { id: number; slug: string; title: string; summary: string; body: string; keywords: string[]; status: "draft" | "published"; publishedAt: string | null; updatedAt: string; copies: Copies };
type Data = { posts: Post[]; templates: { kind: string; label: string }[]; lines: string[] };

const btn = "rounded-lg border border-line bg-white px-3 py-2 text-[14px] font-semibold text-ink disabled:opacity-50";
const btnPrimary = "rounded-lg bg-accent px-3 py-2 text-[14px] font-semibold text-white disabled:opacity-50";
const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[14px]";

/**
 * 관리자 > 마케팅: 검색에 잘 걸리는 자료를 만들고 배포한다.
 * ① 가진 자료(혼잡도·FAQ)로 가이드 초안 만들기 → 고치기 → 게시(/guide/주소, 사이트맵·IndexNow로 네이버·빙에 바로 알림, 구글은 사이트맵)
 * ② 채널별 배포본(네이버 블로그·인스타그램·쓰레드·X)을 복사하거나 글쓰기 화면을 연다.
 */
export default function AdminMarketing() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("subway-line");
  const [line, setLine] = useState("2");
  const [edit, setEdit] = useState<Post | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = () =>
    fetch("/api/admin/marketing")
      .then((r) => r.json())
      .then((j) => (j.posts ? setD(j) : setMsg(j.error ?? "불러오지 못했습니다.")))
      .catch(() => setMsg("불러오지 못했습니다."));
  useEffect(() => {
    load();
  }, []);

  const call = async (method: string, payload: unknown) => {
    setBusy(true);
    const r = await fetch("/api/admin/marketing", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    return { ok: r.ok, j };
  };

  const draft = async () => {
    const { ok, j } = await call("POST", { action: "draft", kind, line });
    setMsg(ok ? `초안을 만들었어요: ${j.post.title}` : j.error ?? "만들지 못했어요.");
    if (ok) setEdit({ ...j.post, copies: { url: "", naver: "", instagram: "", threads: "", x: "" } });
    load();
  };
  const save = async () => {
    if (!edit) return;
    const { ok, j } = await call("PUT", { id: edit.id, slug: edit.slug, title: edit.title, summary: edit.summary, body: edit.body, keywords: edit.keywords });
    setMsg(ok ? "저장했어요." : j.error ?? "저장하지 못했어요.");
    if (ok) setEdit(null);
    load();
  };
  const publish = async (p: Post, on: boolean) => {
    const { ok, j } = await call("PATCH", { id: p.id, status: on ? "published" : "draft" });
    setMsg(ok ? (on ? `게시했어요. 검색엔진에 알렸어요: /guide/${p.slug}` : "게시를 내렸어요.") : j.error ?? "바꾸지 못했어요.");
    load();
  };
  const remove = async (p: Post) => {
    if (!window.confirm(`"${p.title}"을(를) 지울까요?`)) return;
    await call("DELETE", { id: p.id });
    load();
  };
  const ping = async () => {
    const { ok, j } = await call("POST", { action: "ping" });
    setMsg(ok && j.ok ? `검색엔진(네이버·빙 등)에 공개 페이지 ${j.count}개를 알렸어요.` : `알리지 못했어요${j.status ? ` (응답 ${j.status})` : ""}. 운영 사이트에서만 보낼 수 있어요.`);
  };
  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      setMsg("복사했어요.");
    } catch {
      setMsg("복사하지 못했어요. 글을 직접 선택해 복사해 주세요.");
    }
  };

  if (!d) return <p className="text-sub">{msg || "불러오는 중…"}</p>;

  return (
    <div className="grid gap-4" data-block-id="S310" data-block-name="마케팅">
      {msg && <div role="status" className="rounded-lg border border-line bg-white px-4 py-3 text-[14px]">{msg}</div>}

      <section className="grid gap-3 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="text-[18px] font-bold">검색 등록 점검</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[14px] text-ink">
          <li><a className="text-accent underline" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">구글 서치 콘솔</a> › Sitemaps에 <code>sitemap.xml</code> 제출, URL 검사에서 홈 색인 요청</li>
          <li><a className="text-accent underline" href="https://searchadvisor.naver.com/" target="_blank" rel="noreferrer">네이버 서치어드바이저</a> › 요청 › 사이트맵 제출, 웹 페이지 수집 요청</li>
          <li><a className="text-accent underline" href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">빙 웹마스터 도구</a>에 사이트 추가(서치 콘솔에서 가져오기 가능)</li>
        </ol>
        <p className="text-[13px] text-sub">새 카풀 글과 게시한 가이드는 IndexNow로 네이버·빙에 자동으로 알려요. 구글은 사이트맵으로 알아서 가져가요.</p>
        <div><button className={btn} disabled={busy} onClick={ping}>공개 페이지 전체 다시 알리기</button></div>
      </section>

      <section className="grid gap-3 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="text-[18px] font-bold">가이드 초안 만들기</h2>
        <p className="text-[14px] text-sub">가지고 있는 혼잡도·FAQ 자료로 초안을 만들어요. 고친 뒤 게시하면 /guide 에 공개되고 검색엔진에 알려요.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${field} w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {d.templates.map((t) => <option key={t.kind} value={t.kind}>{t.label}</option>)}
          </select>
          {kind === "subway-line" && (
            <select className={`${field} w-auto`} value={line} onChange={(e) => setLine(e.target.value)}>
              {d.lines.map((l) => <option key={l} value={l}>{l}호선</option>)}
            </select>
          )}
          <button className={btnPrimary} disabled={busy} onClick={draft}>초안 만들기</button>
        </div>
      </section>

      {edit && (
        <section className="grid gap-3 rounded-2xl border-2 border-accent bg-white p-5">
          <h2 className="text-[18px] font-bold">고치기</h2>
          <label className="grid gap-1 text-[13px] text-sub">주소(/guide/…, 영문·숫자·하이픈)<input className={field} value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></label>
          <label className="grid gap-1 text-[13px] text-sub">제목(검색 결과 제목)<input className={field} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
          <label className="grid gap-1 text-[13px] text-sub">요약(검색 결과 설명, 120자 안팎)<textarea className={field} rows={2} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></label>
          <label className="grid gap-1 text-[13px] text-sub">본문(## 소제목, - 목록, | 표 |)<textarea className={`${field} font-mono`} rows={14} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
          <label className="grid gap-1 text-[13px] text-sub">검색어(쉼표로 구분)<input className={field} value={edit.keywords.join(", ")} onChange={(e) => setEdit({ ...edit, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })} /></label>
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy} onClick={save}>저장</button>
            <button className={btn} onClick={() => setEdit(null)}>닫기</button>
          </div>
        </section>
      )}

      <section className="grid gap-3 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="text-[18px] font-bold">자료 목록 · 배포</h2>
        {d.posts.length === 0 && <p className="text-[14px] text-sub">아직 자료가 없어요. 위에서 초안을 만들어 보세요.</p>}
        <ul className="grid gap-3">
          {d.posts.map((p) => (
            <li key={p.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-[13px] text-sub">/guide/{p.slug} · {p.status === "published" ? "게시됨" : "초안"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.status === "published" && <a className={btn} href={`/guide/${p.slug}`} target="_blank" rel="noreferrer">보기</a>}
                  <button className={btn} onClick={() => setEdit(p)}>고치기</button>
                  <button className={p.status === "published" ? btn : btnPrimary} disabled={busy} onClick={() => publish(p, p.status !== "published")}>{p.status === "published" ? "내리기" : "게시"}</button>
                  <button className={btn} onClick={() => setOpen(open === p.id ? null : p.id)}>배포본</button>
                  <button className={btn} onClick={() => remove(p)}>지우기</button>
                </div>
              </div>
              {open === p.id && (
                <div className="mt-3 grid gap-3">
                  {p.status !== "published" && <p className="text-[13px] text-warn">게시 전이에요. 배포본의 링크가 열리려면 먼저 게시하세요.</p>}
                  <CopyBox title="네이버 블로그" text={p.copies.naver} onCopy={copy} open="https://blog.naver.com/GoBlogWrite.naver" note="블로그 글쓰기에 붙여 넣고, 원문 링크를 꼭 남겨요(같은 글 중복은 원문 링크로 구분)." />
                  <CopyBox title="인스타그램 캡션" text={p.copies.instagram} onCopy={copy} note="인스타그램은 웹 글쓰기가 없어 휴대폰 앱에서 붙여 넣어요. 프로필 링크를 모두의카풀로." />
                  <CopyBox title="쓰레드" text={p.copies.threads} onCopy={copy} open={`https://www.threads.net/intent/post?text=${encodeURIComponent(p.copies.threads)}`} />
                  <CopyBox title="X" text={p.copies.x} onCopy={copy} open={`https://twitter.com/intent/tweet?text=${encodeURIComponent(p.copies.x)}`} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CopyBox({ title, text, onCopy, open, note }: { title: string; text: string; onCopy: (s: string) => void; open?: string; note?: string }) {
  return (
    <div className="grid gap-1.5 rounded-lg bg-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">{title} <span className="font-normal text-sub">{text.length}자</span></p>
        <div className="flex gap-2">
          <button className={btn} onClick={() => onCopy(text)}>복사</button>
          {open && <a className={btn} href={open} target="_blank" rel="noreferrer">글쓰기 열기</a>}
        </div>
      </div>
      <textarea readOnly className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px]" rows={5} value={text} />
      {note && <p className="text-[12px] text-sub">{note}</p>}
    </div>
  );
}
