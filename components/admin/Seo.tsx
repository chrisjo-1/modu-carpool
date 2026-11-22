"use client";

import { useEffect, useState } from "react";
import { api, Card } from "@/components/ui";

type Faq = { q: string; a: string };
type Page = { slug: string; keyword: string; title: string; description: string; h1: string; body: string; faq: Faq[]; published: boolean; publishedAt: string | null; updatedAt: string };
type Home = { title: string; description: string; keywords: string[] };
type Data = { home: Home; pages: Page[]; fixed: { path: string; name: string; keywords: string[] }[]; limits: { title: number; description: number } };

const SITE = "https://moducarpool.com";
const box = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const btn = "min-h-0 rounded-lg px-3 py-1.5 text-[14px] font-semibold disabled:opacity-50";
const day = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Count({ n, max }: { n: number; max: number }) {
  return <span className={`text-[12px] tabular-nums ${n > max ? "font-bold text-warn" : "text-sub"}`}>{n}/{max}자{n > max ? " · 검색 결과에서 잘릴 수 있어요" : ""}</span>;
}

/** 검색 결과에 보일 모양(대략) */
function Snippet({ title, url, desc }: { title: string; url: string; desc: string }) {
  return (
    <div className="rounded-xl border border-line bg-bg px-3 py-2">
      <p className="truncate text-[12px] text-sub">{url}</p>
      <p className="truncate text-[16px] font-semibold text-accent">{title || "(제목 없음)"}</p>
      <p className="line-clamp-2 text-[13px] text-sub">{desc || "(설명 없음)"}</p>
    </div>
  );
}

const EMPTY: Page = { slug: "", keyword: "", title: "", description: "", h1: "", body: "", faq: [], published: false, publishedAt: null, updatedAt: "" };

/** 관리자 설정 › 'SEO 키워드'(2026-11-22 사용자 지시): 홈 제목·설명·키워드, 키워드 안내 페이지(/guide/주소) 만들기·공개 */
export default function AdminSeo() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [home, setHome] = useState<Home | null>(null);
  const [kwText, setKwText] = useState("");
  const [edit, setEdit] = useState<(Page & { isNew: boolean }) | null>(null);
  const [askDel, setAskDel] = useState(false);

  const load = async () => {
    const r = await api<Data>("/api/admin/seo");
    if (!r.ok) return setMsg(r.error || "불러오지 못했어요.");
    setD(r.data);
    setHome(r.data.home);
    setKwText(r.data.home.keywords.join(", "));
  };
  useEffect(() => {
    load();
  }, []);

  const lim = d?.limits ?? { title: 30, description: 80 };

  const saveHome = async () => {
    if (!home) return;
    setBusy(true);
    setMsg("");
    const keywords = kwText.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const r = await api<{ home: Home }>("/api/admin/seo", "PUT", { ...home, keywords });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setMsg("홈 제목·설명·키워드를 저장했어요. 검색엔진이 다시 수집하면 반영돼요.");
    load();
  };

  const savePage = async (publish?: boolean) => {
    if (!edit) return;
    setBusy(true);
    setMsg("");
    const r = await api("/api/admin/seo", "POST", { ...edit, published: publish ?? edit.published, faq: edit.faq.filter((f) => f.q.trim() && f.a.trim()) });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setMsg(publish ? `공개했어요: ${SITE}/guide/${edit.slug}` : "저장했어요.");
    setEdit(null);
    load();
  };

  const delPage = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await api(`/api/admin/seo?slug=${encodeURIComponent(edit.slug)}`, "DELETE");
    setBusy(false);
    setAskDel(false);
    if (!r.ok) return setMsg(r.error);
    setMsg("삭제했어요.");
    setEdit(null);
    load();
  };

  const setF = (i: number, k: keyof Faq, v: string) => setEdit((e) => (e ? { ...e, faq: e.faq.map((f, j) => (j === i ? { ...f, [k]: v } : f)) } : e));

  return (
    <section data-block-id="S442" data-block-name="관리자 SEO 키워드" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">SEO 키워드</h2>
        <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">구글 서치콘솔</a>
        <a href="https://searchadvisor.naver.com/console/board" target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">네이버 서치어드바이저</a>
        <a href="https://searchad.naver.com" target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">네이버 키워드 검색량</a>
      </div>
      <p className="text-[13px] text-sub">검색 순위는 실적 보고서(구글 서치콘솔 › 실적, 네이버 › 리포트 › 검색 유입)에서 확인하고, 여기서는 사이트에 넣는 제목·설명·키워드와 키워드별 안내 페이지를 관리해요. 저장하면 10분 안에 사이트에 반영되고, 공개한 페이지는 네이버·빙에 바로 알려요.</p>
      {msg && <p className="rounded-lg bg-accentSoft px-3 py-2 text-[14px] text-ink">{msg}</p>}

      {home && (
        <Card data-block-id="C454" className="space-y-3 p-4">
          <p className="font-semibold">홈 (moducarpool.com)</p>
          <label className="block space-y-1">
            <span className="flex justify-between text-[13px] font-semibold">제목 <Count n={home.title.length} max={lim.title} /></span>
            <input data-block-id="F451" className={box} value={home.title} onChange={(e) => setHome({ ...home, title: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-[13px] font-semibold">설명 <Count n={home.description.length} max={lim.description} /></span>
            <textarea data-block-id="F452" className={`${box} h-20`} value={home.description} onChange={(e) => setHome({ ...home, description: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-[13px] font-semibold">키워드 (쉼표로 나눠요, 최대 30개)</span>
            <textarea data-block-id="F453" className={`${box} h-16`} value={kwText} onChange={(e) => setKwText(e.target.value)} />
          </label>
          <p className="text-[12px] text-sub">가장 중요한 키워드를 제목 앞쪽에 넣어 주세요. 검색엔진은 제목 앞 30자와 설명 앞 80자를 가장 많이 봐요.</p>
          <Snippet title={home.title} url={SITE} desc={home.description} />
          <button data-block-id="B514" type="button" disabled={busy} onClick={saveHome} className={`${btn} bg-accent text-white`}>홈 저장</button>
        </Card>
      )}

      {d && (
        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">키워드 안내 페이지 ({d.pages.length})</p>
            <button data-block-id="B515" type="button" onClick={() => { setEdit({ ...EMPTY, isNew: true }); setAskDel(false); }} className={`${btn} bg-accent text-white`}>+ 새 키워드 페이지</button>
          </div>
          <p className="text-[12px] text-sub">키워드 하나에 페이지 하나를 두면 그 키워드로 검색될 가능성이 커져요. 공개하면 {SITE}/guide/주소 로 열려요. 숨김 = 초안(검색에 안 나옴).</p>
          {d.pages.length === 0 && <p className="text-[14px] text-sub">아직 없어요.</p>}
          <ul className="divide-y divide-line">
            {d.pages.map((p) => (
              <li key={p.slug} className="flex flex-wrap items-center gap-2 py-2 text-[14px]">
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${p.published ? "bg-mintSoft text-mint" : "bg-bg text-sub"}`}>{p.published ? "공개" : "숨김"}</span>
                <b>{p.keyword}</b>
                {p.published ? (
                  <a href={`/guide/${p.slug}`} target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">/guide/{p.slug}</a>
                ) : (
                  <span className="text-[13px] text-sub">/guide/{p.slug}</span>
                )}
                <span className="text-[12px] text-sub">{day(p.updatedAt)}</span>
                <button type="button" onClick={() => { setEdit({ ...p, isNew: false }); setAskDel(false); }} className={`${btn} ml-auto border border-line bg-white`}>수정</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {edit && (
        <Card data-block-id="C455" className="space-y-3 border-accent p-4">
          <p className="font-semibold">{edit.isNew ? "새 키워드 페이지" : `수정 · ${edit.keyword}`}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[13px] font-semibold">키워드</span>
              <input data-block-id="F454" className={box} placeholder="예: 출퇴근 카풀" value={edit.keyword} onChange={(e) => setEdit({ ...edit, keyword: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-[13px] font-semibold">주소 (영문 소문자·숫자·-)</span>
              <input data-block-id="F455" className={box} placeholder="예: commute-carpool" value={edit.slug} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="flex justify-between text-[13px] font-semibold">검색 결과 제목 <Count n={edit.title.length} max={lim.title} /></span>
            <input data-block-id="F456" className={box} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-[13px] font-semibold">검색 결과 설명 <Count n={edit.description.length} max={lim.description} /></span>
            <textarea data-block-id="F457" className={`${box} h-16`} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </label>
          <Snippet title={edit.title} url={`${SITE}/guide/${edit.slug || "주소"}`} desc={edit.description} />
          <label className="block space-y-1">
            <span className="text-[13px] font-semibold">페이지 큰 제목</span>
            <input data-block-id="F458" className={box} value={edit.h1} onChange={(e) => setEdit({ ...edit, h1: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-[13px] font-semibold">본문 <span className={`text-[12px] ${edit.body.trim().length < 200 ? "text-warn" : "text-sub"}`}>{edit.body.trim().length}자 (공개하려면 200자 넘게)</span></span>
            <textarea data-block-id="F459" className={`${box} h-64 font-mono text-[14px]`} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            <span className="text-[12px] text-sub">한 줄 = 한 문단 · <b>## </b>로 시작하면 소제목 · <b>- </b>로 시작하면 목록. 키워드를 첫 문단에 자연스럽게 한두 번 넣어 주세요.</span>
          </label>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold">자주 묻는 질문 (검색 결과에 질문·답이 펼쳐질 수 있어요)</p>
            {edit.faq.map((f, i) => (
              <div key={i} className="space-y-1 rounded-lg border border-line p-2">
                <input className={box} placeholder="질문" value={f.q} onChange={(e) => setF(i, "q", e.target.value)} />
                <textarea className={`${box} h-16`} placeholder="답" value={f.a} onChange={(e) => setF(i, "a", e.target.value)} />
                <button type="button" onClick={() => setEdit({ ...edit, faq: edit.faq.filter((_, j) => j !== i) })} className="text-[12px] text-sub underline">이 질문 빼기</button>
              </div>
            ))}
            {edit.faq.length < 10 && (
              <button type="button" onClick={() => setEdit({ ...edit, faq: [...edit.faq, { q: "", a: "" }] })} className={`${btn} border border-line bg-white`}>+ 질문 추가</button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {edit.published ? (
              <>
                <button data-block-id="B516" type="button" disabled={busy} onClick={() => savePage(true)} className={`${btn} bg-accent text-white`}>저장 (공개 유지)</button>
                <button type="button" disabled={busy} onClick={() => savePage(false)} className={`${btn} border border-line bg-white`}>숨기기</button>
              </>
            ) : (
              <>
                <button data-block-id="B517" type="button" disabled={busy} onClick={() => savePage(true)} className={`${btn} bg-accent text-white`}>공개하기</button>
                <button type="button" disabled={busy} onClick={() => savePage(false)} className={`${btn} border border-line bg-white`}>숨김으로 저장</button>
              </>
            )}
            <button type="button" onClick={() => { setEdit(null); setAskDel(false); }} className={`${btn} border border-line bg-white`}>닫기</button>
            {!edit.isNew && !askDel && <button type="button" onClick={() => setAskDel(true)} className="ml-auto text-[13px] text-sub underline">삭제</button>}
            {askDel && (
              <span className="ml-auto flex items-center gap-2 text-[13px]">
                정말 삭제할까요?
                <button type="button" disabled={busy} onClick={delPage} className={`${btn} bg-warn text-white`}>삭제</button>
                <button type="button" onClick={() => setAskDel(false)} className={`${btn} border border-line bg-white`}>아니요</button>
              </span>
            )}
          </div>
        </Card>
      )}

      {d && (
        <Card className="space-y-2 p-4">
          <p className="font-semibold">이미 있는 페이지 (코드로 만든 것 · 고치려면 운영팀에 요청)</p>
          <ul className="space-y-1 text-[14px]">
            {d.fixed.map((f) => (
              <li key={f.path} className="flex flex-wrap gap-x-2">
                <a href={f.path} target="_blank" rel="noreferrer" className="font-medium text-accent underline">{f.name}</a>
                <span className="text-sub">{f.keywords.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
