import type { Metadata } from "next";
import DocView from "@/components/DocView";
import { hasDb, ensureSchema } from "@/lib/server";
import { DEFAULT_DOCS, DOC_TITLE, getDoc, type DocKey } from "@/lib/terms";

export const docMeta = (k: DocKey): Metadata => ({ title: DOC_TITLE[k], alternates: { canonical: `/${k}` } });

/** /terms, /privacy 공용 화면 */
export default async function DocPage({ k }: { k: DocKey }) {
  let body = DEFAULT_DOCS[k];
  if (hasDb()) {
    try {
      await ensureSchema();
      body = (await getDoc(k)).body;
    } catch {
      /* DB 오류 시 초안 표시 */
    }
  }
  const other: DocKey = k === "terms" ? "privacy" : "terms";
  return (
    <main data-block-id={k === "terms" ? "S202" : "S203"} data-block-name={DOC_TITLE[k]} className="mx-auto max-w-2xl bg-white px-5 pb-16 pt-6">
      <nav className="mb-6 flex items-center justify-between text-[14px]">
        <a href="/" className="font-semibold text-accent">← 모두의카풀</a>
        <a href={`/${other}`} className="text-sub underline">{DOC_TITLE[other]}</a>
      </nav>
      <DocView body={body} />
    </main>
  );
}
