import { checkAdminPassword, clearCookie, db, ensureSchema, hasDb, isAdmin, json, setAdminSession } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return json({ admin: false });
  let stats: { users: number; rides: number; total: number } | null = null;
  if (hasDb()) {
    try {
      await ensureSchema();
      const sql = db();
      const u = await sql`select count(*)::int as n from users`;
      const r = await sql`select count(*)::int as n, coalesce(sum(total),0)::int as t from rides`;
      stats = { users: u[0].n as number, rides: r[0].n as number, total: r[0].t as number };
    } catch {
      stats = null;
    }
  }
  return json({ admin: true, db: hasDb(), stats });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  await new Promise((r) => setTimeout(r, 400)); // 무차별 대입 완화
  if (!checkAdminPassword(String(body?.password ?? ""))) return json({ error: "비밀번호가 맞지 않습니다." }, 401);
  await setAdminSession();
  return json({ ok: true });
}

export async function DELETE() {
  await clearCookie("admin");
  return json({ ok: true });
}
