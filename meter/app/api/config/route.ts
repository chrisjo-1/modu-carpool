import { sanitizeConfig } from "@/lib/config";
import { db, ensureSchema, hasDb, isAdmin, json, loadConfig } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await loadConfig());
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않아 저장할 수 없습니다." }, 503);
  const config = sanitizeConfig(await req.json().catch(() => null));
  try {
    await ensureSchema();
    await db()`insert into app_config (id, data) values (1, ${JSON.stringify(config)}::jsonb)
               on conflict (id) do update set data = excluded.data`;
    return json(config);
  } catch {
    return json({ error: "저장하지 못했습니다." }, 500);
  }
}
