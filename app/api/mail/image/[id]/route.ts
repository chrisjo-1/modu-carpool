import { db, ensureSchema, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 메일 속 이미지. 주소를 아는 사람만 받을 수 있는 임의 ID이고, 한 번 받으면 오래 캐시된다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "없는 이미지입니다." }, 404);
  try {
    await ensureSchema();
    const rows = await db()`select content_type, data from mail_images where id = ${id}`;
    if (!rows.length) return json({ error: "없는 이미지입니다." }, 404);
    const bytes = Buffer.from(String(rows[0].data), "base64");
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": String(rows[0].content_type), "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return json({ error: "이미지를 불러오지 못했습니다." }, 500);
  }
}
