import { body, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 저장한 발송 작성본 목록 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const rows = await db()`select id, name, category, subject, body, created_at from mail_templates order by created_at desc limit 100`;
    return json({ templates: rows.map((r) => ({ ...r, created_at: new Date(r.created_at as string).getTime() })) });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 작성본 저장. id가 있으면 덮어쓴다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const name = text(b.name, 80);
  const subject = text(b.subject, 200);
  const bodyText = text(b.body, 5000);
  const category = b.category === "marketing" ? "marketing" : "transactional";
  if (!name) return json({ error: "저장할 이름을 적어 주세요." }, 400);
  if (!subject || !bodyText) return json({ error: "메일 제목과 본문을 적어 주세요." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    if (isUuid(b.id)) {
      await sql`update mail_templates set name = ${name}, category = ${category}, subject = ${subject}, body = ${bodyText} where id = ${b.id}`;
      return json({ ok: true, id: b.id });
    }
    const rows = await sql`insert into mail_templates (name, category, subject, body) values (${name}, ${category}, ${subject}, ${bodyText}) returning id`;
    return json({ ok: true, id: rows[0].id });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 작성본 삭제 ?id= */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from mail_templates where id = ${id}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
