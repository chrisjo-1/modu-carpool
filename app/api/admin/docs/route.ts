import { DOCS, getDoc, saveDoc, type DocKey } from "@/lib/terms";
import { body, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

export async function GET() {
  if (!(await isAdmin())) return denied();
  try {
    await ensureSchema();
    return json({ terms: await getDoc("terms"), privacy: await getDoc("privacy") });
  } catch (e) {
    return fail(e);
  }
}

/** {key: terms|privacy, body} 저장 */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const key = b.key as DocKey;
  if (!DOCS.includes(key)) return json({ error: "문서 종류가 올바르지 않습니다." }, 400);
  const text = typeof b.body === "string" ? b.body.replace(/\r/g, "").trim() : "";
  if (text.length < 20) return json({ error: "내용이 너무 짧습니다." }, 400);
  if (text.length > 40000) return json({ error: "내용은 4만 자까지입니다." }, 400);
  try {
    await ensureSchema();
    await saveDoc(key, text);
    return json({ ok: true, doc: await getDoc(key) });
  } catch (e) {
    return fail(e);
  }
}
