import type { Metadata } from "next";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { db, ensureSchema, hasDb } from "@/lib/server";
import { seedHelp } from "@/lib/help";
import { SITE_URL } from "@/lib/site";

// 관리자가 고친 도움말을 반영하도록 1시간마다 다시 만든다.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "자주 묻는 질문 — 카풀 이용·카풀 규제",
  description: "모두의카풀 이용 방법과 출퇴근 카풀 규제(비용을 나눌 수 있는 시간, 보험)를 정리한 자주 묻는 질문입니다.",
  alternates: { canonical: "/faq" },
  openGraph: { title: "자주 묻는 질문 | 모두의카풀", url: "/faq" },
};

type Item = { id: number; topic: string; title: string; body: string };

async function items(): Promise<Item[]> {
  if (!hasDb()) return [];
  try {
    await ensureSchema();
    await seedHelp();
    const rows = await db()`select id, topic, title, body from help_items where section = 'faq' and active order by topic, sort, id`;
    return rows.map((r) => ({ id: Number(r.id), topic: String(r.topic ?? "app"), title: String(r.title), body: String(r.body) }));
  } catch {
    return [];
  }
}

export default async function Page() {
  const list = await items();
  const groups: { key: string; label: string; rows: Item[] }[] = [
    { key: "app", label: "앱 사용", rows: list.filter((i) => i.topic !== "law") },
    { key: "law", label: "카풀 규제", rows: list.filter((i) => i.topic === "law") },
  ].filter((g) => g.rows.length);
  // 검색 결과에 질문·답이 보이게 하는 구조화 데이터(화면에 보이는 질문과 같은 내용).
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: list.map((i) => ({ "@type": "Question", name: i.title, acceptedAnswer: { "@type": "Answer", text: i.body } })) };
  return (
    <PublicPage blockId="S304" name="자주 묻는 질문">
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "자주 묻는 질문", url: `${SITE_URL}/faq` }]} />
      {list.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <h1 className="text-[26px] font-bold leading-tight">자주 묻는 질문</h1>
      {list.length === 0 && <p className="mt-4 text-sub">질문을 준비하고 있어요.</p>}
      {groups.map((g) => (
        <section key={g.key} className="mt-8">
          <h2 className="text-[18px] font-bold">{g.label}</h2>
          <div className="mt-3 space-y-2">
            {g.rows.map((i) => (
              <details key={i.id} className="rounded-2xl border border-line px-4 py-3">
                <summary className="cursor-pointer font-semibold">{i.title}</summary>
                <p className="mt-2 whitespace-pre-line text-sub">{i.body}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-6 text-[13px] text-sub">카풀 규제 안내는 이해를 돕기 위한 것으로 법률 자문이 아니에요.</p>
    </PublicPage>
  );
}
