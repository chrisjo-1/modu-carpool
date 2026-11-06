import { SMS_GROUP_LABEL, smsSummary, smsTargets, type SmsGroup } from "@/lib/smsTargets";
import { ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CSV 한 칸(수식으로 해석될 글자는 앞에 작은따옴표) */
const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const kst = (t: string | null) => (t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "");

/**
 * 관리자 메일 탭 '문자·알림톡 대상'(lib/smsTargets.ts).
 * GET → 그룹별 인원. GET ?csv=all|apple|bad|unread|none → 명단 CSV(전화번호는 넣지 않고 있음 O/X만).
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  try {
    await ensureSchema();
    const list = await smsTargets();
    const want = new URL(req.url).searchParams.get("csv");
    if (!want) return json({ groups: smsSummary(list), at: Date.now() });
    const rows = want === "all" ? list : list.filter((x) => x.group === want);
    const header = ["그룹", "구분", "고유번호", "이메일", "전화번호 있음", "임시 계정", "마지막 메일(한국시간)"];
    const lines = rows
      .sort((a, b) => Number(b.phone) - Number(a.phone) || Number(b.newWarp) - Number(a.newWarp))
      .map((x) => [SMS_GROUP_LABEL[x.group as SmsGroup], x.newWarp ? "신워프" : "구워프", x.code, x.email, x.phone ? "O" : "X", x.account ? "O" : "X", kst(x.lastMail)]);
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replaceAll("-", "");
    const csv = "﻿" + [header, ...lines].map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sms-targets-${want}-${today}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
