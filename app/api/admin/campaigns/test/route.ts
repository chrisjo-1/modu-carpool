import { RETENTION_TEXT, renderHtml } from "@/lib/campaign";
import { deliverWithStatus, type MailCategory } from "@/lib/mail";
import { body, db, ensureSchema, fail, isAdmin, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";
const KEY = "mail_test_recipients";
const MAX = 5;
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/** 저장해 둔 테스트 받는 주소(최대 5개) */
export async function GET() {
  if (!(await isAdmin())) return denied();
  try {
    await ensureSchema();
    const rows = await db()`select value from settings where key = ${KEY}`;
    let list: string[] = [];
    try {
      list = rows.length ? (JSON.parse(String(rows[0].value)) as string[]) : [];
    } catch {
      list = [];
    }
    return json({ recipients: Array.isArray(list) ? list.filter((x) => typeof x === "string" && isEmail(x)).slice(0, MAX) : [] });
  } catch (e) {
    return fail(e);
  }
}

/** 테스트 받는 주소 목록 저장 {recipients: string[]} */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const list = [...new Set((Array.isArray(b.recipients) ? b.recipients : []).map((x) => text(x, 120).toLowerCase()).filter(isEmail))].slice(0, MAX);
  try {
    await ensureSchema();
    await db()`insert into settings (key, value) values (${KEY}, ${JSON.stringify(list)}) on conflict (key) do update set value = excluded.value`;
    return json({ ok: true, recipients: list });
  } catch (e) {
    return fail(e);
  }
}

/** 고른 주소(최대 5곳)로 테스트 발송. 대상자 정책과 한도를 거치지 않으며 로그에 테스트로 남긴다. {to: string | string[]} */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  const b = await body(req);
  const raw = Array.isArray(b.to) ? b.to : [b.to];
  const to = [...new Set(raw.map((x) => text(x, 120).toLowerCase()).filter(isEmail))].slice(0, MAX);
  const subject = text(b.subject, 200);
  const bodyText = text(b.body, 5000);
  const category: MailCategory = b.category === "marketing" ? "marketing" : "transactional";
  if (!to.length) return json({ error: "테스트 받을 이메일을 골라 주세요." }, 400);
  if (!subject || !bodyText) return json({ error: "메일 제목과 본문을 입력해 주세요." }, 400);
  try {
    const html = renderHtml(bodyText);
    // 텍스트 버전에는 이미지 표시 대신 안내 문구를 넣는다.
    const plain = `${bodyText.replace(/\{\{img:[0-9a-f-]{36}\}\}/g, "[이미지]")}\n\n${RETENTION_TEXT}`;
    const results = await Promise.all(
      to.map(async (addr) => ({
        to: addr,
        status: await deliverWithStatus({
          kind: "campaign-test",
          category,
          to: addr,
          subject: category === "marketing" && !subject.startsWith("(광고)") ? `(광고) ${subject}` : subject,
          html,
          text: plain,
          testOnly: true,
        }),
      })),
    );
    const sent = results.filter((r) => r.status === "sent" || r.status === "dryrun").length;
    return json({ ok: sent > 0, sent, results });
  } catch (e) {
    return fail(e);
  }
}
