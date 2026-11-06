import { getJob, getTemplates, kakaoConfig, kakaoStats, runKakaoJob, saveTemplates, setJob, testSend, type KakaoTemplate } from "@/lib/kakao";
import { body, ensureSchema, fail, isAdmin, json } from "@/lib/server";
import type { SmsGroup } from "@/lib/smsTargets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GROUPS: SmsGroup[] = ["apple", "bad", "unread", "none"];

/** 관리자 알림톡(lib/kakao.ts): 설정 상태·템플릿·발송 작업·기록 */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    return json({ config: kakaoConfig().has, ready: kakaoConfig().ready, fallback: kakaoConfig().fallback, templates: await getTemplates(), job: await getJob(), stats: await kakaoStats() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "관리자 로그인이 필요합니다." }, 401);
  try {
    await ensureSchema();
    const b = await body(req);
    if (b.action === "templates") return json({ ok: true, templates: await saveTemplates((Array.isArray(b.templates) ? b.templates : []) as KakaoTemplate[]) });
    if (b.action === "test") return json(await testSend(String(b.templateKey ?? ""), String(b.to ?? "")));
    if (b.action === "start") {
      if (!kakaoConfig().ready) return json({ error: "솔라피 환경변수(SOLAPI_API_KEY·SOLAPI_API_SECRET·SOLAPI_PFID)를 먼저 넣어 주세요." }, 400);
      const t = (await getTemplates()).find((x) => x.key === b.templateKey);
      if (!t?.templateId) return json({ error: "카카오 승인 템플릿 ID가 있는 템플릿을 골라 주세요." }, 400);
      const groups = (Array.isArray(b.groups) ? b.groups : []).filter((g): g is SmsGroup => GROUPS.includes(g as SmsGroup));
      if (!groups.length) return json({ error: "보낼 그룹을 골라 주세요." }, 400);
      const warp = b.warp === "new" || b.warp === "old" ? b.warp : "all";
      const cap = Math.max(0, Math.min(100_000, Math.round(Number(b.cap) || 0)));
      await setJob({ on: true, templateKey: t.key, groups, warp, cap, startedAt: new Date().toISOString() });
      const first = await runKakaoJob();
      return json({ ok: true, first, job: await getJob() });
    }
    if (b.action === "stop") {
      const j = await getJob();
      if (j) await setJob({ ...j, on: false, note: "관리자가 멈췄어요" });
      return json({ ok: true, job: await getJob() });
    }
    return json({ error: "알 수 없는 요청" }, 400);
  } catch (e) {
    return fail(e);
  }
}
