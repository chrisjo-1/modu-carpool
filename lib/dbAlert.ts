/**
 * DB 비상 경고 메일(2026-11-25 사용자 지시 '비상시 관리자에게 경고메일 발송' — 이날 Neon 무료 한도 초과(402)로 3시간 넘게 로그인 불가).
 * DB 오류 가운데 '한도 초과·연결 불가'처럼 서비스 전체가 멈추는 종류만 골라 ADMIN_EMAILS 전원에게 바로 알린다.
 * DB가 죽은 상황이라 mail_log·settings를 쓰지 않고 Resend API를 직접 부른다. 같은 서버(인스턴스)에서는 30분에 한 번만.
 */
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);

const FATAL = [
  [/HTTP status 402|exceeded the quota|quota/i, "Neon 사용 한도 초과(402) — 요금제·사용량 확인 필요"],
  [/HTTP status 5\d\d|Server error/i, "Neon 서버 오류(5xx)"],
  [/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection terminated|timeout exceeded|getaddrinfo/i, "DB 연결 실패"],
  [/password authentication failed|role .* does not exist|endpoint .* (is disabled|not found)/i, "DB 접속 정보 오류(비밀번호·엔드포인트)"],
] as const;

let lastSent = 0;
const GAP = 30 * 60_000;

export function dbFatalKind(e: unknown): string {
  const msg = e instanceof Error ? `${e.name} ${e.constructor?.name ?? ""} ${e.message}` : String(e ?? "");
  // 다른 외부 API(카카오·OSRM 등)의 fetch failed와 헷갈리지 않게 DB 오류 표시가 있는 것만
  if (!/neon|database|postgres/i.test(msg)) return "";
  for (const [re, label] of FATAL) if (re.test(msg)) return label;
  return "";
}

/** 오류가 서비스 전체를 멈추는 DB 오류면 관리자에게 경고 메일. 반환: 보냈는지. 실패해도 조용히 넘어간다. */
export async function alertDbDown(e: unknown, where = ""): Promise<boolean> {
  const kind = dbFatalKind(e);
  if (!kind) return false;
  const now = Date.now();
  if (now - lastSent < GAP) return false;
  const to = adminEmails();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!to.length || !key || !from) return false;
  lastSent = now;
  const msg = (e instanceof Error ? e.message : String(e)).slice(0, 600);
  const at = new Date(now).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const subject = `[모두의카풀 긴급] DB 장애 — ${kind}`;
  const text = `모두의카풀 DB에 문제가 생겨 회원이 로그인·글 보기를 못 할 수 있어요.\n\n종류: ${kind}\n시각: ${at}\n위치: ${where || "-"}\n오류: ${msg}\n\n확인할 곳\n- Neon 콘솔: https://console.neon.tech\n- Vercel 오류 로그: https://vercel.com/dashboard\n- 사이트: https://moducarpool.com\n\n같은 서버에서는 30분에 한 번만 보내요. 오류가 이어지면 다시 와요.`;
  const html = `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191F28;max-width:560px">
<h2 style="margin:0 0 12px;color:#C2410C">모두의카풀 DB 장애 경고</h2>
<p style="margin:0 0 12px;line-height:1.6">DB에 문제가 생겨 회원이 로그인·글 보기를 못 할 수 있어요.</p>
<table style="border-collapse:collapse;font-size:14px;line-height:1.6">
<tr><td style="padding:2px 12px 2px 0;color:#6B7684">종류</td><td><b>${esc(kind)}</b></td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#6B7684">시각</td><td>${esc(at)}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#6B7684">위치</td><td>${esc(where || "-")}</td></tr>
</table>
<pre style="white-space:pre-wrap;background:#F5F7FA;border-radius:8px;padding:10px;font-size:12px">${esc(msg)}</pre>
<p style="line-height:1.8;font-size:14px"><a href="https://console.neon.tech">Neon 콘솔</a> · <a href="https://vercel.com/dashboard">Vercel</a> · <a href="https://moducarpool.com">모두의카풀 바로가기</a></p>
<p style="font-size:12px;color:#6B7684">같은 서버에서는 30분에 한 번만 보내요. 오류가 이어지면 다시 와요.</p></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error("[db-alert] 메일 실패", res.status);
    return res.ok;
  } catch (err) {
    console.error("[db-alert]", err);
    return false;
  }
}
