import { db, ensureSchema, hasDb, isUuid } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 프로필 사진을 이미지로 내려준다. 사진은 가입자가 올린 240px JPEG만 저장된다. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const id = p.get("u");
  if (!hasDb() || !isUuid(id)) return new Response(null, { status: 404 });
  try {
    await ensureSchema();
    const rows = await db()`select photo from users where id = ${id}`;
    const photo = rows.length ? String(rows[0].photo) : "";
    if (!photo) return new Response(null, { status: 404 });
    return new Response(Buffer.from(photo, "base64"), {
      headers: {
        "Content-Type": "image/jpeg",
        // 주소의 v 값이 바뀔 때만 내용이 달라지므로 길게 보관해도 된다.
        "Cache-Control": p.get("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  } catch (e) {
    console.error("[photo]", e);
    return new Response(null, { status: 500 });
  }
}
