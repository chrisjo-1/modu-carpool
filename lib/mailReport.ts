import { audienceRows } from "./campaign";
import { campaignAudience } from "./campaignRun";
import { deliver } from "./mail";
import { db } from "./server";
import { smsSummary, smsTargets } from "./smsTargets";

/**
 * 어제(한국 날짜) 대량 메일 결과 보고서를 관리자 메일로 하루 한 번(2026-11-17 사용자 지시 '보낸 결과는 관리자 메일로 피드백해').
 * 반송·열람 기록이 밤사이 들어오므로 다음 날 아침 첫 자동 실행(9시대)에 센다. settings mail_report_day로 하루 한 번.
 * 대상: 어제 메일을 보낸 캠페인 + 자동 이어 보내기 중인 캠페인. 번호·주소는 넣지 않고 수만.
 */
const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const kstDay = (offset = 0) => new Date(Date.now() + 9 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");
const n = (v: unknown) => Number(v ?? 0).toLocaleString("ko-KR");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export async function maybeSendMailReport(force = false): Promise<boolean> {
  const sql = db();
  const today = kstDay();
  if (!force) {
    const claim = await sql`insert into settings (key, value) values ('mail_report_day', ${today})
      on conflict (key) do update set value = excluded.value where settings.value <> ${today} returning value`;
    if (!claim.length) return false;
  }
  const to = adminEmails();
  if (!to.length) return false;
  const day = kstDay(-1);
  const from = `${day}T00:00:00+09:00`;
  const until = `${today}T00:00:00+09:00`;

  const camps = await sql`
    select c.*,
      count(l.*) filter (where l.status = 'sent' and l.created_at >= ${from}::timestamptz and l.created_at < ${until}::timestamptz)::int as d_sent,
      count(l.*) filter (where l.status = 'sent' and l.created_at >= ${from}::timestamptz and l.created_at < ${until}::timestamptz and l.bounced_at is not null)::int as d_bounced,
      count(l.*) filter (where l.status = 'sent' and l.created_at >= ${from}::timestamptz and l.created_at < ${until}::timestamptz and (l.opened_at is not null or l.clicked_at is not null))::int as d_opened,
      count(l.*) filter (where l.status = 'sent' and l.created_at >= ${from}::timestamptz and l.created_at < ${until}::timestamptz and l.clicked_at is not null)::int as d_clicked,
      count(l.*) filter (where l.status = 'sent')::int as t_sent,
      count(l.*) filter (where l.status = 'sent' and l.bounced_at is not null)::int as t_bounced,
      count(l.*) filter (where l.status = 'sent' and (l.opened_at is not null or l.clicked_at is not null))::int as t_opened,
      count(l.*) filter (where l.status = 'sent' and l.clicked_at is not null)::int as t_clicked
    from mail_campaigns c left join mail_log l on l.campaign_id = c.id and l.kind = 'campaign'
    group by c.id
    having (c.auto and c.status = 'sending') or count(l.*) filter (where l.status = 'sent' and l.created_at >= ${from}::timestamptz and l.created_at < ${until}::timestamptz) > 0
    order by c.created_at`;

  const blocks: string[] = [];
  const lines: string[] = [];
  for (const c of camps) {
    const id = String(c.id);
    // 도메인별(누적)
    const dom = await sql`select case split_part(to_email, '@', 2) when 'gmail.com' then 'gmail' when 'naver.com' then 'naver' else '기타' end as d,
        count(*)::int as sent, count(bounced_at)::int as bounced, count(*) filter (where opened_at is not null or clicked_at is not null)::int as opened
      from mail_log where campaign_id = ${id} and status = 'sent' group by 1 order by 2 desc`;
    // 메일을 받은 뒤 가입(비번 설정)한 인원: 받은 주소로 된 계정이 비번을 정했고, 그 시각이 처음 받은 뒤
    const joined = await sql`with r as (select to_email, min(created_at) as at from mail_log where campaign_id = ${id} and status = 'sent' group by 1)
      select count(*)::int as n from r join users u on lower(u.email) = r.to_email
      where not u.pw_reset_required and u.withdrawn_at is null and coalesce(u.pw_at, u.created_at) > r.at`;
    let left: number | null = null;
    try {
      left = (await audienceRows(campaignAudience(c), { campaignId: id, before: new Date(c.created_at as string).toISOString(), limit: 100000 })).length;
    } catch { left = null; }
    const title = esc(String(c.title));
    const domRows = dom.map((x) => `<tr><td>${x.d}</td><td align="right">${n(x.sent)}</td><td align="right">${n(x.bounced)} (${pct(Number(x.bounced), Number(x.sent))})</td><td align="right">${pct(Number(x.opened), Number(x.sent))}</td></tr>`).join("");
    blocks.push(`<h3 style="margin:18px 0 6px;font-size:15px">${title}${c.auto && c.status === "sending" ? " · 자동 발송 중" : ""}${Number(c.daily_cap) > 0 ? ` · 하루 ${n(c.daily_cap)}통` : ""}</h3>
      <table cellpadding="4" style="border-collapse:collapse;font-size:13px">
        <tr><td>어제</td><td>보냄 <b>${n(c.d_sent)}</b></td><td>반송 ${n(c.d_bounced)} (${pct(Number(c.d_bounced), Number(c.d_sent))})</td><td>열람 ${n(c.d_opened)} (${pct(Number(c.d_opened), Number(c.d_sent))})</td><td>클릭 ${n(c.d_clicked)}</td></tr>
        <tr><td>누적</td><td>보냄 <b>${n(c.t_sent)}</b></td><td>반송 ${n(c.t_bounced)} (${pct(Number(c.t_bounced), Number(c.t_sent))})</td><td>열람 ${n(c.t_opened)} (${pct(Number(c.t_opened), Number(c.t_sent))})</td><td>클릭 ${n(c.t_clicked)}</td></tr>
      </table>
      <p style="margin:6px 0;font-size:13px">메일 받은 뒤 가입(비번 설정) <b>${n(joined[0]?.n)}명</b> · 남은 대상 <b>${left === null ? "확인 못 함" : `${n(left)}명`}</b>${left !== null && Number(c.daily_cap) > 0 ? ` (약 ${Math.ceil(left / Number(c.daily_cap))}일)` : ""}</p>
      ${domRows ? `<table cellpadding="4" style="border-collapse:collapse;font-size:12px;color:#475569"><tr><th align="left">도메인(누적)</th><th>보냄</th><th>반송</th><th>열람</th></tr>${domRows}</table>` : ""}`);
    lines.push(`■ ${String(c.title)}\n어제 보냄 ${n(c.d_sent)} · 반송 ${n(c.d_bounced)}(${pct(Number(c.d_bounced), Number(c.d_sent))}) · 열람 ${n(c.d_opened)} · 클릭 ${n(c.d_clicked)}\n누적 보냄 ${n(c.t_sent)} · 반송 ${n(c.t_bounced)}(${pct(Number(c.t_bounced), Number(c.t_sent))}) · 열람 ${n(c.t_opened)} · 클릭 ${n(c.t_clicked)}\n가입 ${n(joined[0]?.n)}명 · 남은 대상 ${left === null ? "-" : n(left)}명\n` +
      dom.map((x) => `  ${x.d}: ${n(x.sent)}통 · 반송 ${pct(Number(x.bounced), Number(x.sent))} · 열람 ${pct(Number(x.opened), Number(x.sent))}`).join("\n"));
  }

  const paused = (await sql`select value from settings where key = 'mail_auto_paused'`)[0]?.value as string | undefined;
  let sms = "";
  let smsText = "";
  try {
    const s = smsSummary(await smsTargets()).filter((x) => x.group === "filtered" || x.group === "bad" || x.group === "apple");
    sms = `<h3 style="margin:18px 0 6px;font-size:15px">문자·알림톡 대상으로 모인 인원</h3><table cellpadding="4" style="border-collapse:collapse;font-size:13px">${s.map((x) => `<tr><td>${esc(x.label)}</td><td align="right">${n(x.total)}명</td><td align="right">전화 있음 ${n(x.phone)}</td></tr>`).join("")}</table>`;
    smsText = "문자·알림톡 대상\n" + s.map((x) => `  ${x.label}: ${n(x.total)}명 (전화 ${n(x.phone)})`).join("\n");
  } catch { /* 명단 집계가 오래 걸리면 빼고 보낸다 */ }

  const head = camps.length ? `어제(${day}) 메일 결과` : `어제(${day})는 보낸 대량 메일이 없어요`;
  const html = `<div style="font-family:sans-serif;color:#0f172a;max-width:640px">
    <h2 style="font-size:17px;margin:0 0 8px">${head}</h2>
    ${paused ? `<p style="padding:8px 10px;border-radius:8px;background:#FFF4EC;color:#C2410C;font-size:13px">자동 발송 멈춤: ${esc(paused)}</p>` : `<p style="font-size:13px;color:#475569">자동 발송: 켜짐(반송률 3% 넘으면 자동으로 멈춤)</p>`}
    ${blocks.join("")}${sms}
    <p style="margin-top:16px;font-size:12px;color:#64748b">반송·열람은 메일 회사가 알려 준 만큼만 셉니다(늦게 들어오는 반송은 다음 보고서에 반영). 전화번호·메일 주소는 넣지 않았어요.</p></div>`;
  const text = `${head}\n${paused ? `자동 발송 멈춤: ${paused}\n` : ""}\n${lines.join("\n\n")}\n\n${smsText}`;
  for (const addr of to) {
    await deliver({ kind: "mail-report-admin", category: "transactional", to: addr, subject: `[모두의카풀 관리자] ${head}`, html, text }).catch(() => false);
  }
  return true;
}
