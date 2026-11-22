import { unstable_cache } from "next/cache";
import { db, ensureSchema, hasDb } from "./server";

/**
 * 관리자 'SEO 키워드' 탭(2026-11-22 사용자 지시: "원하는 키워드로 계속 검색되게 관리할 곳 — 탭을 만들고 기존 키워드를 미리 등록").
 * - 홈 제목·설명·키워드: settings `seo_home`(JSON). 읽지 못하면 아래 기본값(배포 당시 문구).
 * - 키워드 안내 페이지: 표 `seo_pages` → 공개하면 /guide/<slug>.
 * 화면에서 읽을 때는 10분 캐시(tag "seo"), 관리자가 저장하면 revalidateTag("seo").
 */

export type SeoHome = { title: string; description: string; keywords: string[] };
export type SeoFaq = { q: string; a: string };
export type SeoPage = {
  slug: string; keyword: string; title: string; description: string; h1: string; body: string; faq: SeoFaq[];
  published: boolean; publishedAt: string | null; updatedAt: string;
};

export const SEO_TAG = "seo";
export const TITLE_MAX = 30;
export const DESC_MAX = 80;

export const DEFAULT_HOME: SeoHome = {
  title: "카풀 앱 모두의카풀 — 출퇴근 카풀 구하기·지하철 앉아가기",
  description:
    "카풀 앱 모두의카풀(구 워프)에서 방향이 같은 사람과 출퇴근 카풀을 무료로 구하세요. 정기카풀·카풀 CALL·경로 분석, 여성 안심동행, 앉을 칸을 알려 주는 지하철 앉아가기까지.",
  keywords: ["카풀", "카풀 앱", "카풀 어플", "카풀 앱 추천", "카풀 구하기", "모두의카풀", "출퇴근 카풀", "정기카풀", "지하철 앉아가기", "워프 카풀", "모카"],
};

/** 코드로 만든 기존 공개 페이지(탭에서 읽기 전용으로 보여 줌) */
export const FIXED_PAGES: { path: string; name: string; keywords: string[] }[] = [
  { path: "/", name: "홈", keywords: ["모두의카풀", "카풀", "카풀 앱"] },
  { path: "/carpool-app", name: "카풀 앱 안내", keywords: ["카풀 앱", "카풀 어플", "카풀 앱 추천", "카풀 구하기"] },
  { path: "/carpool", name: "지역별 카풀(구 페이지 포함)", keywords: ["강남 카풀", "분당 카풀", "○○구 출퇴근 카풀"] },
  { path: "/subway", name: "지하철 앉아가기(노선·역 페이지 포함)", keywords: ["지하철 앉아가기", "지하철 앉는 칸", "○호선 앉아가기"] },
  { path: "/faq", name: "자주 묻는 질문", keywords: ["카풀 규제", "카풀 비용"] },
  { path: "/warp", name: "워프 이전 안내", keywords: ["워프 카풀", "워프 앱"] },
];

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

/** 처음 한 번 넣는 초안(숨김) — 아직 전용 페이지가 없는 기존 키워드 */
const SEED_PAGES: Omit<SeoPage, "publishedAt" | "updatedAt" | "published">[] = [
  {
    slug: "commute-carpool",
    keyword: "출퇴근 카풀",
    title: "출퇴근 카풀 구하기 — 같은 방향 이웃과 함께 출근",
    description: "집과 회사가 같은 방향인 이웃과 출퇴근 카풀을 무료로 구하세요. 평일 출퇴근 시간 실비 분담, 정기카풀·안심동행까지 모두의카풀에서.",
    h1: "출퇴근 카풀, 같은 길 이웃과 함께 타세요",
    body: [
      "출퇴근 카풀은 집과 회사 방향이 같은 사람끼리 차 한 대로 함께 출근·퇴근하는 것을 말해요. 운전자는 기름값과 통행료 부담을 덜고, 탑승자는 갈아타기 없이 편하게 출근할 수 있어요.",
      "## 출퇴근 카풀은 이렇게 구해요",
      "- 내 출퇴근 정보(집·회사·출근·퇴근 시각)를 등록해요.",
      "- 찾기 화면의 거리순이나 [경로 분석]으로 같은 길 운전자·탑승자를 찾아요.",
      "- 마음에 드는 글에 신청하고, 수락되면 대화방에서 만날 곳을 정해요.",
      "## 비용은 실비만 나눠요",
      "출퇴근 카풀은 평일 오전 7~9시, 오후 6~8시에 한해 운전자와 탑승자가 기름값 같은 실비를 나눌 수 있어요. 모두의카풀은 그 밖의 시간 글은 무료로만 올리게 해요.",
      "## 처음 만나는 사람이라 걱정된다면",
      "프로필 사진·운전자 등급·별점을 보고 고를 수 있고, 여성 회원은 안심동행을 신청하면 도착할 때까지 운영팀이 함께 지켜봐요.",
    ].join("\n"),
    faq: [
      { q: "출퇴근 카풀 비용은 얼마가 적당한가요?", a: "평일 출퇴근 시간에만 기름값·통행료 같은 실비를 나눌 수 있어요. 무료로 함께 타는 것이 기본이고, 정기카풀은 회당 금액이나 월 정액으로 미리 정해 두면 편해요." },
      { q: "퇴근할 때도 같이 탈 수 있나요?", a: "네. 출퇴근 정보에 퇴근 시각을 함께 적으면 퇴근길 카풀도 찾을 수 있고, 정기카풀 계약서에 퇴근도 함께 넣을 수 있어요." },
    ],
  },
  {
    slug: "regular-carpool",
    keyword: "정기카풀",
    title: "정기카풀 — 매일 같은 시간 출퇴근 카풀 짝 찾기",
    description: "매일 같은 시간 같은 길로 출퇴근하는 분과 정기카풀을 맺으세요. 요일·시각·비용을 앱 안 계약서로 정하고 꾸준히 함께 타요.",
    h1: "정기카풀, 매일 같은 길 짝을 찾아요",
    body: [
      "정기카풀은 정해진 요일·시각에 같은 사람과 꾸준히 함께 타는 카풀이에요. 매번 상대를 찾을 필요가 없어 출퇴근이 가장 편해지는 방법이에요.",
      "## 정기카풀이 좋은 점",
      "- 출근·퇴근 시각이 맞는 상대와 고정으로 다녀 약속이 어긋나지 않아요.",
      "- 비용을 회당 또는 월 정액으로 정해 두고 부담 없이 나눠요.",
      "- 앱 안 정기카풀 계약서로 요일·시간·탑승 지점·기다려 주는 시간을 함께 정해요.",
      "## 정기카풀 짝 찾는 법",
      "출퇴근 정보를 등록하면 정기카풀 글로 바로 올라가요. 내 글에서 [매칭 가능성 있는 회원 보기]를 누르면 같은 길·같은 시간대 회원을 점수 순으로 보여 줘요.",
    ].join("\n"),
    faq: [
      { q: "정기카풀 계약서는 꼭 써야 하나요?", a: "선택이에요. 써 두면 요일·시각·비용·기다려 주는 시간을 서로 확인할 수 있어 오해를 줄일 수 있어요." },
      { q: "중간에 그만둘 수 있나요?", a: "네. 계약서 화면에서 해지할 수 있고, 상대에게 알림이 가요." },
    ],
  },
  {
    slug: "find-carpool",
    keyword: "카풀 구하기",
    title: "카풀 구하기 — 운전자·탑승자 무료로 찾는 법",
    description: "카풀 구하는 법을 3단계로 정리했어요. 같은 방향 운전자·탑승자를 무료로 찾고, CALL로 주변 운전자에게 바로 함께 가자고 요청하세요.",
    h1: "카풀 구하기, 3단계면 충분해요",
    body: [
      "카풀을 구하려면 나와 같은 방향으로 가는 사람을 찾는 것이 먼저예요. 모두의카풀은 출발지·도착지·시간을 기준으로 같은 길 회원을 이어 줘요.",
      "## 탑승자라면",
      "- 출발지·도착지·출발 시각을 적어 탑승자 글을 올려요.",
      "- 운전자 글에 [운전자에게 신청하기]를 누르거나, CALL로 주변 운전자에게 '같이 가요'를 보내요(출발 30분~24시간 전).",
      "## 운전자라면",
      "- 빈자리가 있는 출퇴근 경로를 운전자 글로 올려요.",
      "- 같은 길 탑승자 글에 신청하거나, 받은 CALL을 수락해요.",
      "## 지역별로 찾기",
      "지역별 카풀 페이지에서 내 구에서 출발하거나 도착하는 카풀을 한눈에 볼 수 있어요.",
    ].join("\n"),
    faq: [
      { q: "카풀을 구하는 데 돈이 드나요?", a: "아니요. 가입·글 올리기·신청·대화 모두 무료예요." },
      { q: "같은 방향 사람이 없으면 어떻게 하나요?", a: "경로 알림을 켜 두면 같은 길 새 글이 올라올 때 알림을 받아요." },
    ],
  },
];

async function seedOnce() {
  const sql = db();
  const got = await sql`insert into settings (key, value) values ('seo_seed_v1', ${new Date().toISOString()}) on conflict (key) do nothing returning 1`;
  if (!got.length) return;
  await sql`insert into settings (key, value) values ('seo_home', ${JSON.stringify(DEFAULT_HOME)}) on conflict (key) do nothing`;
  for (const p of SEED_PAGES) {
    await sql`insert into seo_pages (slug, keyword, title, description, h1, body, faq, published)
      values (${p.slug}, ${p.keyword}, ${p.title}, ${p.description}, ${p.h1}, ${p.body}, ${JSON.stringify(p.faq)}::jsonb, false)
      on conflict (slug) do nothing`;
  }
}

export function cleanHome(v: unknown): SeoHome {
  const o = (v ?? {}) as Partial<SeoHome>;
  const title = String(o.title ?? "").trim().slice(0, 80) || DEFAULT_HOME.title;
  const description = String(o.description ?? "").trim().slice(0, 200) || DEFAULT_HOME.description;
  const keywords = (Array.isArray(o.keywords) ? o.keywords : [])
    .map((k) => String(k).trim().slice(0, 30))
    .filter(Boolean)
    .filter((k, i, a) => a.indexOf(k) === i)
    .slice(0, 30);
  return { title, description, keywords: keywords.length ? keywords : DEFAULT_HOME.keywords };
}

export async function readHomeRaw(): Promise<SeoHome> {
  await ensureSchema();
  await seedOnce();
  const r = await db()`select value from settings where key = 'seo_home'`;
  try {
    return cleanHome(r.length ? JSON.parse(String(r[0].value)) : DEFAULT_HOME);
  } catch {
    return DEFAULT_HOME;
  }
}

/** 화면용(10분 캐시, 실패하면 기본값) */
export const getSeoHome = unstable_cache(
  async (): Promise<SeoHome> => {
    if (!hasDb()) return DEFAULT_HOME;
    try {
      return await readHomeRaw();
    } catch {
      return DEFAULT_HOME;
    }
  },
  ["seo-home"],
  { revalidate: 600, tags: [SEO_TAG] },
);

const toPage = (r: Record<string, unknown>): SeoPage => ({
  slug: String(r.slug),
  keyword: String(r.keyword ?? ""),
  title: String(r.title ?? ""),
  description: String(r.description ?? ""),
  h1: String(r.h1 ?? ""),
  body: String(r.body ?? ""),
  faq: Array.isArray(r.faq) ? (r.faq as SeoFaq[]).filter((f) => f && f.q && f.a) : [],
  published: !!r.published,
  publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null,
  updatedAt: new Date(r.updated_at as string).toISOString(),
});

export async function listSeoPagesRaw(): Promise<SeoPage[]> {
  await ensureSchema();
  await seedOnce();
  const rows = await db()`select * from seo_pages order by published desc, updated_at desc`;
  return rows.map(toPage);
}

/** 공개된 페이지 한 건(10분 캐시) */
export const getPublishedSeoPage = unstable_cache(
  async (slug: string): Promise<SeoPage | null> => {
    if (!hasDb() || !SLUG_RE.test(slug)) return null;
    try {
      await ensureSchema();
      const r = await db()`select * from seo_pages where slug = ${slug} and published`;
      return r.length ? toPage(r[0]) : null;
    } catch {
      return null;
    }
  },
  ["seo-page"],
  { revalidate: 600, tags: [SEO_TAG] },
);

/** 공개된 페이지 목록(사이트맵·링크용, 10분 캐시) */
export const listPublishedSeoPages = unstable_cache(
  async (): Promise<{ slug: string; keyword: string; updatedAt: string }[]> => {
    if (!hasDb()) return [];
    try {
      await ensureSchema();
      const rows = await db()`select slug, keyword, updated_at from seo_pages where published order by published_at`;
      return rows.map((r) => ({ slug: String(r.slug), keyword: String(r.keyword), updatedAt: new Date(r.updated_at as string).toISOString() }));
    } catch {
      return [];
    }
  },
  ["seo-published"],
  { revalidate: 600, tags: [SEO_TAG] },
);
