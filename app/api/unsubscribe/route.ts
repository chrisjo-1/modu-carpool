import { ensureSchema, hasDb } from "@/lib/server";
import { emailFromToken, suppress } from "@/lib/unsub";

export const dynamic = "force-dynamic";

const page = (msg: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수신거부 · 모두의카풀</title></head><body style="margin:0;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#F5F7FA;color:#191F28;padding:40px 16px"><div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #E5E8EB;border-radius:16px;padding:28px 24px"><p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#2F6BFF">모두의카풀</p><p style="margin:0;font-size:16px;line-height:1.6">${msg}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

/** 광고성 메일 수신거부. 메일 하단 링크(GET)와 메일 클라이언트의 원클릭 수신거부(POST) 모두 받는다. */
async function unsubscribe(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const email = emailFromToken(t);
  if (!email || !hasDb()) return page("잘못된 수신거부 링크예요. 고객센터로 문의해 주세요.", 400);
  try {
    await ensureSchema();
    await suppress(email, "unsubscribe");
  } catch (e) {
    console.error("[unsubscribe]", e);
    return page("처리 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.", 500);
  }
  return page("광고성 메일 수신을 거부했어요. 앞으로 광고성 메일은 보내지 않습니다. 계정과 서비스에 관한 안내 메일은 계속 받으실 수 있어요.");
}

export const GET = unsubscribe;
export const POST = unsubscribe;
