import DocPage, { docMeta } from "../doc-page";

export const dynamic = "force-dynamic";
export const metadata = docMeta("privacy");
export default function Page() {
  return <DocPage k="privacy" />;
}
