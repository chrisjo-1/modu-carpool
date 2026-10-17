import { db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 1_000_000; // 1MB: 메일과 화면이 느려지지 않도록 작은 파일만

/** 관리자: 메일에 넣을 이미지 올리기. 본문에 넣을 표시 문자열을 돌려준다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return json({ error: "파일을 읽지 못했습니다." }, 400);
  }
  if (!file) return json({ error: "이미지 파일을 골라 주세요." }, 400);
  if (!TYPES.includes(file.type)) return json({ error: "png, jpg, gif, webp 이미지만 넣을 수 있어요." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "이미지는 1MB 이하로 줄여서 올려 주세요." }, 400);
  try {
    await ensureSchema();
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const rows = await db()`insert into mail_images (content_type, data) values (${file.type}, ${data}) returning id`;
    const id = String(rows[0].id);
    return json({ ok: true, id, token: `{{img:${id}}}` });
  } catch (e) {
    return fail(e);
  }
}
