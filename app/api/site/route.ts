import { getSlogan } from "@/lib/slogan";
import { ensureSchema, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 공개: 홈 상단 주제목 */
export async function GET() {
  await ensureSchema().catch(() => null);
  return json({ slogan: await getSlogan() });
}
