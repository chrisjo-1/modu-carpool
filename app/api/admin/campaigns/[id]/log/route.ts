import { db, ensureSchema, fail, hasDb, isAdmin, isUuid, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 캠페인 발송 기록(받은 사람별). ?status=all|sent|failed|blocked &q=이메일 &before=밀리초 &limit=
 * 캠페인 전체 집계(보냄·실패·차단·열람·클릭)와 목록을 함께 준다. 전화번호는 넣지 않는다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: "잘못된 캠페인입니다." }, 400);
  const p = new URL(req.url).searchParams;
  const status = ["sent", "failed", "blocked"].includes(p.get("status") ?? "") ? String(p.get("status")) : "";
  const q = text(p.get("q") ?? "", 80).toLowerCase();
  const beforeN = Number(p.get("before"));
  const before = Number.isFinite(beforeN) && beforeN > 0 ? new Date(beforeN).toISOString() : null;
  const limit = Math.min(Math.max(Number(p.get("limit")) || 100, 1), 300);
  try {
    await ensureSchema();
    const sql = db();
    const camp = await sql`select id, title from mail_campaigns where id = ${id}`;
    if (!camp.length) return json({ error: "캠페인을 찾을 수 없어요." }, 404);
    const totals = await sql`select
        count(*) filter (where status = 'sent')::int as sent,
        count(*) filter (where status = 'failed')::int as failed,
        count(*) filter (where status = 'blocked')::int as blocked,
        count(*) filter (where status = 'sent' and opened_at is not null)::int as opened,
        count(*) filter (where status = 'sent' and clicked_at is not null)::int as clicked
      from mail_log where campaign_id = ${id}`;
    const rows = await sql`select created_at, to_email, status, error, opened_at, clicked_at from mail_log
      where campaign_id = ${id}
        and (${status} = '' or status = ${status})
        and (${q} = '' or to_email like ${"%" + q + "%"})
        and (${before}::timestamptz is null or created_at < ${before}::timestamptz)
      order by created_at desc limit ${limit + 1}`;
    const more = rows.length > limit;
    const list = rows.slice(0, limit).map((r) => ({
      created_at: new Date(r.created_at as string).getTime(),
      to_email: String(r.to_email),
      status: String(r.status),
      error: String(r.error ?? ""),
      opened: !!r.opened_at,
      clicked: !!r.clicked_at,
    }));
    return json({
      title: String(camp[0].title),
      totals: totals[0],
      rows: list,
      more,
      next: more ? list[list.length - 1]?.created_at ?? null : null,
    });
  } catch (e) {
    return fail(e);
  }
}
