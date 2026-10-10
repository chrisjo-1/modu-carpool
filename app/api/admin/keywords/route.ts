import { randomBytes } from "node:crypto";
import { GROUPS, clearKeywordCache, getKeywords, type Keywords } from "@/lib/keywords";
import { body, db, ensureSchema, fail, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

export async function GET() {
  if (!(await isAdmin())) return denied();
  try {
    await ensureSchema();
    const kw = await getKeywords();
    // 키워드별로 몇 개의 글에 쓰였는지
    const used = await db()`select t, count(*)::int as n from posts, unnest(tags) as t group by t`;
    return json({ keywords: kw, used: Object.fromEntries(used.map((u) => [u.t, u.n])) });
  } catch (e) {
    return fail(e);
  }
}

/** 전체 목록 저장 {gift, driver, rider}: 각 항목 {id?, label}. id 가 없으면 새로 만든다. 빠진 항목은 삭제. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const next = { gift: [], driver: [], rider: [] } as Keywords;
  for (const g of GROUPS) {
    const list = Array.isArray(b[g]) ? (b[g] as { id?: unknown; label?: unknown }[]) : [];
    if (list.length > 20) return json({ error: "묶음마다 키워드는 20개까지입니다." }, 400);
    const seen = new Set<string>();
    for (const k of list) {
      const label = typeof k?.label === "string" ? k.label.trim().slice(0, 12) : "";
      if (!label) continue;
      if (seen.has(label)) return json({ error: `같은 이름의 키워드가 있습니다: ${label}` }, 400);
      seen.add(label);
      const id = typeof k.id === "string" && /^[a-z0-9-]{2,30}$/.test(k.id) ? k.id : `${g[0]}-${randomBytes(4).toString("hex")}`;
      next[g].push({ id, label });
    }
  }
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values ('keywords', ${JSON.stringify(next)}) on conflict (key) do update set value = excluded.value`;
    clearKeywordCache();
    return json({ ok: true, keywords: next });
  } catch (e) {
    return fail(e);
  }
}
