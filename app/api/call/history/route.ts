import { listCalls } from "@/lib/call";
import { currentUserId, ensureSchema, fail, json, needLogin } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 내가 보낸 CALL 이력. 다른 회원의 정보(이름·연락처)는 포함하지 않는다. */
export async function GET() {
  const me = await currentUserId();
  if (!me) return needLogin();
  try {
    await ensureSchema();
    const rows = await listCalls({ caller: me, limit: 30 });
    return json({ calls: rows.map(({ name: _n, email: _e, ...r }) => r) });
  } catch (e) {
    return fail(e);
  }
}
