import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db, ensureSchema, hasDb } from "@/lib/server";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * 알림톡의 짧은 주소(lib/kakao.ts makeLink). 누를 때마다 30분짜리 비밀번호 설정 링크를 새로 만들어 보낸다.
 * 이미 비밀번호를 정한 회원은 그냥 첫 화면(로그인)으로. 카카오 링크 미리보기는 열지 않은 것으로 친다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const home = NextResponse.redirect(`${SITE_URL}/`, 302);
  if (!/^[A-Za-z0-9]{6,12}$/.test(code) || !hasDb()) return home;
  const ua = req.headers.get("user-agent") ?? "";
  if (/kakaotalk-scrap|facebookexternalhit|Slackbot|bot\b/i.test(ua)) return home;
  try {
    await ensureSchema();
    const sql = db();
    const r = await sql`update kakao_links set clicks = clicks + 1, clicked_at = coalesce(clicked_at, now())
      where code = ${code} and expires_at > now() returning user_id`;
    if (!r.length) return home;
    const u = await sql`select id, pw_reset_required from users where id = ${r[0].user_id} and withdrawn_at is null and not blocked`;
    if (!u.length || !u[0].pw_reset_required) return home;
    const token = randomBytes(32).toString("hex");
    await sql`insert into password_resets (token_hash, user_id, ip, expires_at) values (${hashToken(token)}, ${u[0].id}, 'kakao', now() + interval '30 minutes')`;
    return NextResponse.redirect(`${SITE_URL}/?reset=${token}`, 302);
  } catch (e) {
    console.error("[s]", e);
    return home;
  }
}
