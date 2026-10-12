import { HELP_SECTIONS, seedHelp, toHelpItem } from "@/lib/help";
import { db, ensureSchema, fail, hasDb, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 도움말 공개 목록(켜진 항목만). 처음 호출되면 기본 내용을 채운다. */
export async function GET() {
  if (!hasDb()) return json({ items: [] });
  try {
    await ensureSchema();
    await seedHelp();
    const rows = await db()`select id, section, title, body, image, sort, active from help_items where active order by sort, id`;
    return json({ sections: HELP_SECTIONS, items: rows.map((r) => toHelpItem(r)) });
  } catch (e) {
    return fail(e);
  }
}
