import { renderHtml } from "@/lib/campaign";
import { deliverWithStatus, type MailCategory } from "@/lib/mail";
import { body, fail, isAdmin, json, text } from "@/lib/server";

export const dynamic = "force-dynamic";

/** 지정한 주소 한 곳으로 테스트 발송. 대상자 정책과 한도를 거치지 않으며 로그에 테스트로 남긴다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  const b = await body(req);
  const to = text(b.to, 120).toLowerCase();
  const subject = text(b.subject, 200);
  const bodyText = text(b.body, 5000);
  const category: MailCategory = b.category === "marketing" ? "marketing" : "transactional";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "테스트 받을 이메일을 입력해 주세요." }, 400);
  if (!subject || !bodyText) return json({ error: "메일 제목과 본문을 입력해 주세요." }, 400);
  try {
    const status = await deliverWithStatus({
      kind: "campaign-test",
      category,
      to,
      subject: category === "marketing" && !subject.startsWith("(광고)") ? `(광고) ${subject}` : subject,
      html: renderHtml(bodyText),
      text: bodyText,
      testOnly: true,
    });
    return json({ ok: status === "sent" || status === "dryrun", status });
  } catch (e) {
    return fail(e);
  }
}
