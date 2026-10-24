import { activePopups } from "@/lib/popups";
import { ensureSchema, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 공개: 지금 보여 줄 앱 접속 팝업(관리용 정보는 빼고) */
export async function GET() {
  await ensureSchema().catch(() => null);
  const c = await activePopups();
  return json({ interval: c.interval, popups: c.items.map(({ id, title, image, link }) => ({ id, title, image, link })) });
}
