import { normEmail } from "@/lib/legacy";
import { ensureSchema, body, fail, hasDb, json, overLimit, recordAttempt, clientIp } from "@/lib/server";
import { suppress } from "@/lib/unsub";

export const dynamic = "force-dynamic";

/**
 * 웹에서 광고성 메일 수신거부. 메일 주소만 받아 발송 제외 목록에 넣는다(주소 확인 메일은 보내지 않음).
 * 누구의 주소든 거부만 할 수 있고, 메일이 더 가는 것을 막는 일이라 해가 없다. IP당 횟수를 제한한다.
 */
export async function POST(req: Request) {
  if (!hasDb()) return json({ error: "잠시 후 다시 시도해 주세요." }, 503);
  const b = await body(req);
  const email = normEmail(b.email);
  if (!email) return json({ error: "이메일 형식을 확인해 주세요." }, 400);
  const ip = clientIp(req);
  if (await overLimit("unsub-web-ip", ip, 10, 60)) return json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  await recordAttempt("unsub-web-ip", ip);
  try {
    await ensureSchema();
    await suppress(email, "unsubscribe_web");
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
