import { CHAT_BANNER_KEY, cleanChatBanner, readChatBanner } from "@/lib/chatBanner";
import { body, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 관리자: 채팅 배너 현재 값 */
export async function GET() {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    return json({ banner: await readChatBanner() });
  } catch (e) {
    return fail(e);
  }
}

/** 관리자: 채팅 배너 저장. 빈 이미지로 저장하면 배너가 사라진다. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const cleaned = cleanChatBanner(b.banner);
  if (!cleaned.ok) return json({ error: cleaned.error }, 400);
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values (${CHAT_BANNER_KEY}, ${JSON.stringify(cleaned.banner)})
      on conflict (key) do update set value = excluded.value`;
    return json({ banner: cleaned.banner });
  } catch (e) {
    return fail(e);
  }
}
