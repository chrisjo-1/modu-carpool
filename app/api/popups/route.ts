import { activeBanners } from "@/lib/banners";
import { activePopups } from "@/lib/popups";
import { ensureSchema, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 공개: 지금 보여 줄 팝업 = 앱 접속 팝업 + 홈 배너(팝업으로 표시, 그 뒤에 이어서). 관리용 정보(켜기·기간)는 빼고 보낸다. */
export async function GET() {
  await ensureSchema().catch(() => null);
  const [c, banners] = await Promise.all([activePopups(), activeBanners()]);
  return json({
    interval: c.interval,
    popups: [
      ...c.items.map(({ id, title, image, link }) => ({ id, title, body: "", image, link, ad: false })),
      ...banners.map(({ id, title, body, image, link, ad }) => ({ id: `b-${id}`, title, body, image, link, ad })),
    ],
  });
}
