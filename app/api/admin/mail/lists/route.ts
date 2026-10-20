import { db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * 관리자 명단 내려받기(CSV, 엑셀에서 바로 열리도록 BOM 포함).
 * - list=suppressed: 발송 제외 주소(수신거부·반송·스팸 신고)
 * - list=claims: 메일로 접수된 탈퇴·개인정보 삭제 확인 링크(요청 한 건마다 한 줄)
 * 이름·전화번호 같은 개인정보는 넣지 않는다. 이메일과 처리 상태만 준다.
 */
const REASON: Record<string, string> = { unsubscribe: "수신거부 링크", bounce: "반송", complaint: "스팸 신고" };
const KIND: Record<string, string> = { withdraw: "탈퇴 확인", purge: "개인정보만 삭제" };

/** CSV 한 칸. 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싸고, 수식으로 해석될 글자는 앞에 작은따옴표를 붙인다. */
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const kst = (t: unknown) => (t ? new Date(t as string).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "");

export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const list = new URL(req.url).searchParams.get("list") === "claims" ? "claims" : "suppressed";
  try {
    await ensureSchema();
    const sql = db();
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replaceAll("-", "");
    let rows: string[][];
    let header: string[];
    let name: string;
    if (list === "claims") {
      header = ["이메일", "요청 종류", "상태", "요청 시각(한국시간)", "링크 만료(한국시간)"];
      const r = await sql`select email_norm, kind, used, expires_at, created_at from withdraw_claims order by created_at desc limit 20000`;
      const now = Date.now();
      rows = r.map((c) => {
        const exp = new Date(c.expires_at as string).getTime();
        const status = c.used ? "처리 완료" : exp > now ? "확인 대기" : "만료";
        return [String(c.email_norm), KIND[String(c.kind)] ?? String(c.kind), status, kst(c.created_at), kst(c.expires_at)];
      });
      name = `mail-received-${today}.csv`;
    } else {
      header = ["이메일", "사유", "등록 시각(한국시간)"];
      const r = await sql`select email, reason, created_at from mail_suppressions order by created_at desc limit 50000`;
      rows = r.map((s) => [String(s.email), REASON[String(s.reason)] ?? String(s.reason), kst(s.created_at)]);
      name = `unsubscribe-list-${today}.csv`;
    }
    const csv = "﻿" + [header, ...rows].map((line) => line.map(cell).join(",")).join("\r\n") + "\r\n";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
