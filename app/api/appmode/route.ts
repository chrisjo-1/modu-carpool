import { body, currentUserId, db, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 회원이 지금 앱(홈 화면에 설치)으로 열었는지, 인터넷 창으로 열었는지 기록한다. 접속(창)마다 한 번. */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return json({ ok: false });
  const b = await body(req);
  const mode = b.mode === "app" ? "app" : "browser";
  const mobile = b.mobile === true;
  try {
    await db()`update users set app_mode = ${mobile ? mode : "pc"}, app_mode_at = now(),
      app_first_at = case when ${mode} = 'app' then coalesce(app_first_at, now()) else app_first_at end
      where id = ${me}`;
  } catch (e) {
    console.error("[appmode]", e);
  }
  return json({ ok: true });
}
