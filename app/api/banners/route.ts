import { activeBanners } from "@/lib/banners";
import { ensureSchema, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 공개: 지금 보여 줄 홈 배너 */
export async function GET() {
  await ensureSchema().catch(() => null);
  const list = await activeBanners();
  // 관리자용 정보(켜기·기간)는 내보내지 않는다
  return json({ banners: list.map(({ id, title, body, image, link, ad }) => ({ id, title, body, image, link, ad })) });
}
