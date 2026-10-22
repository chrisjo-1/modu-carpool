// 마케팅 자료: 공개 가이드 글(/guide/slug)과 채널별 배포본. 서버에서만 쓴다.
import { db, ensureSchema } from "./server";
import { SITE_URL } from "./site";
import { busiest, hasCongestion, keyStations, lineName, SEO_LINES, SUBWAY_TIPS } from "./seoSubway";
import { carCountOf } from "./subway";

export type MarketingPost = { id: number; slug: string; title: string; summary: string; body: string; keywords: string[]; status: "draft" | "published"; publishedAt: string | null; updatedAt: string };

export const toPost = (r: Record<string, unknown>): MarketingPost => ({
  id: Number(r.id),
  slug: String(r.slug),
  title: String(r.title),
  summary: String(r.summary ?? ""),
  body: String(r.body),
  keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
  status: r.status === "published" ? "published" : "draft",
  publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null,
  updatedAt: new Date(r.updated_at as string).toISOString(),
});

export async function publishedPosts(limit = 200): Promise<MarketingPost[]> {
  await ensureSchema();
  const rows = await db()`select * from marketing_posts where status = 'published' order by published_at desc limit ${limit}`;
  return rows.map(toPost);
}

export async function postBySlug(slug: string): Promise<MarketingPost | null> {
  await ensureSchema();
  const rows = await db()`select * from marketing_posts where slug = ${slug} and status = 'published' limit 1`;
  return rows[0] ? toPost(rows[0]) : null;
}

/** 주소용 이름: 영문 소문자·숫자·하이픈만(한글 주소는 공유할 때 깨지기 쉬워서). */
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export type Draft = { slug: string; title: string; summary: string; body: string; keywords: string[] };
export type TemplateKind = "subway-line" | "subway-tips" | "carpool-law" | "warp";
export const TEMPLATES: { kind: TemplateKind; label: string }[] = [
  { kind: "subway-line", label: "노선 앉아가기 가이드(노선 선택)" },
  { kind: "subway-tips", label: "지하철 앉아가는 요령" },
  { kind: "carpool-law", label: "출퇴근 카풀 규제 정리" },
  { kind: "warp", label: "워프 → 모두의카풀 안내" },
];

/** 가지고 있는 자료(혼잡도·FAQ)로 가이드 초안을 만든다. 관리자가 고친 뒤 게시한다. */
export async function makeDraft(kind: TemplateKind, line = "2"): Promise<Draft> {
  if (kind === "subway-line") {
    const name = lineName(line);
    const top = hasCongestion(line) ? busiest(line, 5) : [];
    const keys = hasCongestion(line) ? keyStations(line, 6) : [];
    const rows = top.map((r) => `| ${r.station} | ${r.next} 방향${r.terminal ? `(${r.terminal} 방면)` : ""} | ${r.slot} | ${r.pct}% |`).join("\n");
    return {
      slug: `subway-line-${line}`,
      title: `${name} 출근길 앉아가는 법 — 붐비는 구간과 앉을 칸`,
      summary: `${name} 평일 출근 시간 가장 붐비는 구간과 앉을 확률이 높은 칸, 앉아가는 요령을 정리했어요.`,
      body: [
        `${name}은 ${carCountOf(line)}칸 열차예요. 출근 시간에 어디가 붐비고 어느 칸에 서야 앉을 확률이 높은지 서울교통공사 시간대별 혼잡도(2026년 6월)로 정리했어요.`,
        top.length ? `## 출근 시간 가장 붐비는 곳\n\n| 역 | 진행 방향 | 시간 | 혼잡도 |\n| --- | --- | --- | --- |\n${rows}` : `## 혼잡도 자료\n\n${name}은 공개 혼잡도 자료가 아직 없어 칸 위치와 이용자 착석 기록으로 앉을 칸을 추정해요.`,
        `## 앉아가는 요령\n\n${SUBWAY_TIPS.map((t) => `- ${t}`).join("\n")}`,
        keys.length ? `## 역별 앉을 칸 보기\n\n${keys.map((s) => `- ${s}역: ${SITE_URL}/subway/${line}/${s}`).join("\n")}` : "",
        `## 모두의카풀 지하철 앉아가기\n\n지하철 정보를 등록하면 지금 시간과 역에 맞춰 앉을 칸을 알려 주고, 곧 내리는 분과 자리를 이어 드려요. ${SITE_URL}/subway/${line}`,
      ].filter(Boolean).join("\n\n"),
      keywords: [`${name} 앉아가기`, `${name} 혼잡도`, "지하철 앉는 법", "지하철 몇 번째 칸", "출근길 지하철"],
    };
  }
  if (kind === "subway-tips") {
    const lines = SEO_LINES.map((l) => `- ${lineName(l)}: ${SITE_URL}/subway/${l}`).join("\n");
    return {
      slug: "subway-seat-tips",
      title: "출근길 지하철에서 앉아가는 요령 3가지",
      summary: "열차가 붙어 올 때 뒤차 타기, 끝에서 두 번째 칸, 큰 역 전에 내리는 사람 앞에 서기. 노선별 앉을 칸 안내까지.",
      body: [
        "매일 서서 가는 출근길, 조금만 요령을 알면 앉을 확률이 올라가요. 모두의카풀이 혼잡도 자료와 이용자 착석 기록으로 정리한 요령이에요.",
        `## 요령 3가지\n\n${SUBWAY_TIPS.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
        `## 노선별 앉을 칸 보기\n\n${lines}`,
      ].join("\n\n"),
      keywords: ["지하철 앉는 법", "지하철 자리 앉기", "출근길 지하철 팁", "지하철 몇 번째 칸"],
    };
  }
  if (kind === "carpool-law") {
    await ensureSchema();
    const rows = await db()`select title, body from help_items where section = 'faq' and topic = 'law' order by sort, id`;
    return {
      slug: "carpool-law",
      title: "출퇴근 카풀은 합법일까? 비용을 나눌 수 있는 시간과 보험 정리",
      summary: "여객자동차 운수사업법 제81조의 출퇴근 카풀 예외, 비용을 나눌 수 있는 시간(평일 7~9시·18~20시), 보험에서 확인할 점.",
      body: [
        "카풀을 하면서 기름값을 나눠도 될까요? 출퇴근 카풀에 관한 규칙을 질문과 답으로 정리했어요. 이해를 돕기 위한 안내이며 법률 자문이 아니에요.",
        ...rows.map((r) => `## ${String(r.title)}\n\n${String(r.body)}`),
        `## 더 보기\n\n자주 묻는 질문: ${SITE_URL}/faq`,
      ].join("\n\n"),
      keywords: ["카풀 합법", "카풀 불법", "출퇴근 카풀 시간", "카풀 비용", "카풀 보험"],
    };
  }
  return {
    slug: "warp-to-moducarpool",
    title: "카풀 앱 워프(warp)가 모두의카풀이 됐어요",
    summary: "워프가 모두의카풀로 이름을 바꾸고 새로 만들어졌어요. 워프 회원은 워프 이메일이나 고유번호로 가입하면 이전 크레딧을 받아요.",
    body: [
      "국내 카풀 커뮤니티 앱 워프가 '모두의카풀'로 이름을 바꿨어요. 같은 방향 사람과 함께 타는 출퇴근 카풀은 그대로이고, 지하철에서 앉을 칸을 알려 주는 '지하철 앉아가기'가 새로 생겼어요.",
      `## 워프 회원이었다면\n\n1. 모두의카풀에서 회원가입을 눌러요.\n2. 워프 고유번호(8자리)나 워프에 쓴 이메일을 입력해요.\n3. 확인 메일의 링크를 누르면 이전 축하 크레딧이 적립돼요.`,
      `## 바로 가기\n\n- 모두의카풀: ${SITE_URL}\n- 지하철 앉아가기: ${SITE_URL}/subway\n- 안내: ${SITE_URL}/warp`,
    ].join("\n\n"),
    keywords: ["모두의카풀", "워프 카풀", "warp 카풀", "모카 카풀", "출퇴근 카풀 앱"],
  };
}

/** 본문(가벼운 마크다운)을 SNS용 평문으로. 표는 한 줄씩 풀어 쓴다. */
function plain(body: string): string {
  return body
    .split("\n")
    .filter((l) => !/^\|\s*-/.test(l))
    .map((l) => (l.startsWith("|") ? l.split("|").slice(1, -1).map((c) => c.trim()).join(" · ") : l.replace(/^#+\s*/, "■ ")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const tags = (k: string[]) => k.map((x) => `#${x.replace(/\s+/g, "")}`).join(" ");

/** 채널별 배포본: 네이버 블로그(원문+출처 링크), 인스타그램(캡션), 쓰레드(500자), X(짧게). */
export function channelCopies(p: { slug: string; title: string; summary: string; body: string; keywords: string[] }) {
  const url = `${SITE_URL}/guide/${p.slug}`;
  const base = ["모두의카풀", ...p.keywords].slice(0, 8);
  const naver = `${p.title}\n\n${plain(p.body)}\n\n원문: ${url}\n\n${tags(base)}`;
  const instagram = `${p.title}\n\n${p.summary}\n\n자세한 내용은 프로필 링크(모두의카풀)에서 확인하세요.\n\n${tags(base)}`;
  const threadsRaw = `${p.title}\n\n${p.summary}\n\n${url}`;
  const threads = threadsRaw.length > 500 ? `${threadsRaw.slice(0, 490)}…` : threadsRaw;
  const xBody = `${p.title} ${url}`;
  const x = xBody.length > 140 ? `${p.title.slice(0, 140 - url.length - 2)}… ${url}` : xBody;
  return { url, naver, instagram, threads, x };
}
