import { currentUserId, db, ensureSchema } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 채팅 사진. 그 대화의 당사자(글 작성자·신청자)만 볼 수 있다. */
export async function GET(req: Request) {
  const me = await currentUserId();
  const id = new URL(req.url).searchParams.get("m");
  if (!me || !id || !/^\d{1,18}$/.test(id)) return new Response(null, { status: 404 });
  try {
    await ensureSchema();
    const rows = await db()`
      select m.image from messages m join requests r on r.id = m.request_id join posts p on p.id = r.post_id
      where m.id = ${id} and (r.user_id = ${me} or p.user_id = ${me})`;
    if (!rows.length || !rows[0].image) return new Response(null, { status: 404 });
    return new Response(Buffer.from(String(rows[0].image), "base64"), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    console.error("[chatimg]", e);
    return new Response(null, { status: 500 });
  }
}
