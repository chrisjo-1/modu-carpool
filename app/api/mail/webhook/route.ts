import { createHmac, timingSafeEqual } from "node:crypto";
import { ensureSchema, hasDb } from "@/lib/server";
import { suppress } from "@/lib/unsub";

export const dynamic = "force-dynamic";

/**
 * Resend 웹훅: 반송(email.bounced)과 스팸 신고(email.complained)를 받아 그 주소를 발송 제외 목록에 넣는다.
 * RESEND_WEBHOOK_SECRET(whsec_...)으로 서명을 확인한 요청만 처리한다.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 503 });
  const id = req.headers.get("svix-id") ?? "";
  const ts = req.headers.get("svix-timestamp") ?? "";
  const sig = req.headers.get("svix-signature") ?? "";
  if (!id || !ts || !sig) return new Response("missing signature", { status: 400 });
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return new Response("stale request", { status: 400 });

  const raw = await req.text();
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64"));
  const ok = sig.split(" ").some((part) => {
    const [v, s = ""] = part.split(",");
    const b = Buffer.from(s);
    return v === "v1" && b.length === expected.length && timingSafeEqual(b, expected);
  });
  if (!ok) return new Response("bad signature", { status: 400 });

  let ev: { type?: string; data?: { to?: string[] | string } };
  try {
    ev = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const reason = ev.type === "email.bounced" ? "bounce" : ev.type === "email.complained" ? "complaint" : "";
  if (!reason || !hasDb()) return Response.json({ ok: true, ignored: true });
  const dt = ev.data?.to;
  const to = Array.isArray(dt) ? dt : dt ? [dt] : [];
  try {
    await ensureSchema();
    for (const a of to) await suppress(String(a), reason);
  } catch (e) {
    console.error("[mail-webhook]", e);
    return new Response("error", { status: 500 });
  }
  return Response.json({ ok: true, suppressed: to.length });
}
