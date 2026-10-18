import { HELP_SECTIONS, seedHelp, toHelpItem, type HelpSection } from "@/lib/help";
import { body, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);
const IMAGE_MAX = 400_000; // 글자 수 기준(base64 포함). 대략 300KB 사진 한 장.

/** 관리자용 도움말 목록(꺼진 항목 포함) */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    await seedHelp();
    const rows = await db()`select id, section, topic, title, body, image, sort, active from help_items order by array_position(${[...HELP_SECTIONS]}::text[], section), sort, id`;
    return json({ items: rows.map((r) => toHelpItem(r)) });
  } catch (e) {
    return fail(e);
  }
}

/** {action:"save", id?, section, topic?, title, body, image, sort, active} 또는 {action:"delete", id} */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();
    if (b.action === "delete") {
      if (!isUuid(b.id) && !/^\d{1,18}$/.test(String(b.id ?? ""))) return json({ error: "잘못된 요청입니다." }, 400);
      await sql`delete from help_items where id = ${String(b.id)}`;
      return json({ ok: true });
    }
    if (b.action !== "save") return json({ error: "잘못된 요청입니다." }, 400);
    const section = HELP_SECTIONS.find((s) => s === b.section) as HelpSection | undefined;
    const title = text(b.title, 80);
    const content = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
    const image = typeof b.image === "string" ? b.image : "";
    const sort = Math.max(0, Math.min(999, Math.round(Number(b.sort)) || 0));
    const active = b.active !== false;
    const topic = b.topic === "law" ? "law" : "app";
    if (!section) return json({ error: "잘못된 항목입니다." }, 400);
    if (title.length < 1) return json({ error: "제목을 입력해 주세요." }, 400);
    if (image && !/^\/(help|subway)\/[\w-]+\.(svg|webp|png|jpg)$/.test(image) && (!image.startsWith("data:image/jpeg;base64,") || image.length > IMAGE_MAX)) return json({ error: "사진은 JPEG 300KB 이하만 넣을 수 있어요." }, 400);
    const id = b.id == null || b.id === "" ? null : String(b.id);
    if (id && !/^\d{1,18}$/.test(id)) return json({ error: "잘못된 요청입니다." }, 400);
    if (id) {
      await sql`update help_items set section = ${section}, topic = ${topic}, title = ${title}, body = ${content}, image = ${image}, sort = ${sort}, active = ${active} where id = ${id}`;
    } else {
      await sql`insert into help_items (section, topic, title, body, image, sort, active) values (${section}, ${topic}, ${title}, ${content}, ${image}, ${sort}, ${active})`;
    }
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
