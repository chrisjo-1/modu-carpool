import { createHash, timingSafeEqual } from "node:crypto";
import { spend } from "@/lib/credits";
import { db, ensureSchema, fail, isUuid, json, overLimit, recordAttempt } from "@/lib/server";

export const dynamic = "force-dynamic";

// 손편지매칭(maeryeok-daehak) 서버만 부르는 창구. 두 서버만 아는 비밀값(PENPAL_PARTNER_SECRET)으로 확인한다.
// link: 고유코드 + 연결 코드 → 회원 id / balance: 잔액 / spend: 차감(ref로 한 번만) / refund: 같은 ref 되돌리기
const MAX_SPEND = 5000;

function authorized(req: Request) {
  const want = process.env.PENPAL_PARTNER_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (want.length < 24 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function POST(req: Request) {
  if (!authorized(req)) return json({ ok: false, error: "forbidden" }, 403);
  let b: Record<string, unknown> = {};
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  try {
    await ensureSchema();
    const sql = db();
    if (b.action === "link") {
      const code = String(b.code ?? "").trim().toUpperCase();
      const pin = String(b.link ?? "").trim();
      if (!/^[0-9]{7}[A-Z]$/.test(code) || !/^\d{6}$/.test(pin)) return json({ ok: false, error: "bad_code" });
      if (await overLimit("penpal_link", code, 5, 10)) return json({ ok: false, error: "too_many" });
      const u = await sql`select id from users where member_code = ${code}`;
      if (!u.length) {
        await recordAttempt("penpal_link", code);
        return json({ ok: false, error: "bad_code" });
      }
      const id = String(u[0].id);
      const hash = createHash("sha256").update(`penpal:${id}:${pin}`).digest("hex");
      const hit = await sql`delete from penpal_links where user_id = ${id} and pin_hash = ${hash} and expires_at > now() returning user_id`;
      if (!hit.length) {
        await recordAttempt("penpal_link", code);
        return json({ ok: false, error: "bad_code" });
      }
      return json({ ok: true, user: id });
    }

    const user = b.user;
    if (!isUuid(user)) return json({ ok: false, error: "bad_user" }, 400);

    if (b.action === "balance") {
      const r = await sql`select credits from users where id = ${user}`;
      return r.length ? json({ ok: true, balance: Number(r[0].credits) }) : json({ ok: false, error: "no_user" });
    }

    const ref = String(b.ref ?? "");
    if (!/^pp-[a-z0-9-]{6,40}$/.test(ref)) return json({ ok: false, error: "bad_ref" }, 400);

    if (b.action === "spend") {
      const amount = Math.round(Number(b.amount));
      if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_SPEND) return json({ ok: false, error: "bad_amount" }, 400);
      const memo = String(b.memo ?? "손편지매칭").slice(0, 60);
      const claimed = await sql`insert into penpal_spends (ref, user_id, amount) values (${ref}, ${user}, ${amount}) on conflict (ref) do nothing returning ref`;
      if (!claimed.length) return json({ ok: false, error: "dup" });
      if (!(await spend(user, amount, "penpal", memo))) {
        await sql`update penpal_spends set refunded = true where ref = ${ref}`;
        return json({ ok: false, error: "short" });
      }
      const r = await sql`select credits from users where id = ${user}`;
      return json({ ok: true, balance: Number(r[0]?.credits ?? 0) });
    }

    if (b.action === "refund") {
      const r = await sql`
        with s as (update penpal_spends set refunded = true where ref = ${ref} and user_id = ${user} and not refunded returning user_id, amount),
        u as (update users set credits = credits + s.amount from s where users.id = s.user_id returning users.id)
        insert into credit_ledger (user_id, amount, reason, memo) select user_id, amount, 'refund', '손편지매칭 결제 취소' from s returning amount`;
      return json({ ok: true, refunded: r.length > 0 });
    }

    return json({ ok: false, error: "bad_action" }, 400);
  } catch (e) {
    return fail(e);
  }
}
