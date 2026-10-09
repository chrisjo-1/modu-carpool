import { db } from "./server";

/** 글 키워드. gift: 무료 운행 감사 표시, driver: 운전자 글, rider: 탑승자 글. id 로 저장해 이름을 바꿔도 지난 글에 반영된다. */
export type Keyword = { id: string; label: string };
export type Keywords = { gift: Keyword[]; driver: Keyword[]; rider: Keyword[] };
export const GROUPS = ["gift", "driver", "rider"] as const;

export const DEFAULT_KEYWORDS: Keywords = {
  gift: [{ id: "g-drink", label: "음료" }, { id: "g-coupon", label: "쿠폰" }, { id: "g-etc", label: "기타" }],
  driver: [
    { id: "d-errand", label: "심부름 가능" },
    { id: "d-pickup", label: "픽업 협의" },
    { id: "d-anywhere", label: "어디든 무료" },
    { id: "d-half", label: "미터기 1/2" },
    { id: "d-talent", label: "재능 공유" },
  ],
  rider: [
    { id: "r-long", label: "장거리" },
    { id: "r-errand", label: "심부름 협의" },
    { id: "r-pet", label: "펫 동반" },
    { id: "r-bag", label: "소량 짐" },
    { id: "r-two", label: "2인" },
    { id: "r-night", label: "심야" },
    { id: "r-drunk", label: "음주" },
  ],
};

export async function getKeywords(): Promise<Keywords> {
  const rows = await db()`select value from settings where key = 'keywords'`;
  if (!rows.length) return DEFAULT_KEYWORDS;
  try {
    const v = JSON.parse(String(rows[0].value));
    const out = { gift: [], driver: [], rider: [] } as Keywords;
    for (const g of GROUPS) out[g] = Array.isArray(v[g]) ? v[g].filter((k: Keyword) => k && typeof k.id === "string" && typeof k.label === "string") : [];
    return out;
  } catch {
    return DEFAULT_KEYWORDS;
  }
}

/** 글에 붙일 수 있는 키워드만 남긴다: 역할에 맞는 내용 키워드 + 무료 운행이면 감사 표시 키워드. 최대 8개 */
export function allowedTags(kw: Keywords, tags: unknown, role: string, cost: string): string[] {
  if (!Array.isArray(tags)) return [];
  const ok = new Set([...(role === "rider" ? kw.rider : kw.driver).map((k) => k.id), ...(cost === "free" ? kw.gift.map((k) => k.id) : [])]);
  return [...new Set(tags.filter((t): t is string => typeof t === "string" && ok.has(t)))].slice(0, 8);
}

/** 글 표시용: id → {label, group}. 지워진 키워드는 빠진다. */
export function tagLabels(kw: Keywords, ids: unknown) {
  if (!Array.isArray(ids)) return [];
  const map = new Map<string, { label: string; group: string }>();
  for (const g of GROUPS) for (const k of kw[g]) map.set(k.id, { label: k.label, group: g });
  return ids.map((id) => map.get(String(id))).filter((x): x is { label: string; group: string } => !!x);
}
