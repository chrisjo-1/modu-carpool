export type Lang = "ko" | "en" | "ja" | "zh";
export const LANGS: [Lang, string][] = [["ko", "한국어"], ["en", "English"], ["ja", "日本語"], ["zh", "中文"]];

/**
 * 번역 사전은 lib/i18nDict.ts 에 따로 두고, 한국어가 아닌 언어를 고를 때만 불러온다(첫 로딩을 가볍게).
 * 불러오기 전에는 한국어 그대로 보인다.
 */
let D: Record<string, [string, string, string]> | null = null;
let loading: Promise<void> | null = null;
export function loadDict(): Promise<void> {
  if (D) return Promise.resolve();
  loading ??= import("./i18nDict").then((m) => {
    D = m.D;
  });
  return loading;
}

const INDEX: Record<Lang, number> = { ko: -1, en: 0, ja: 1, zh: 2 };

export function translate(lang: Lang, ko: string): string {
  if (lang === "ko") return ko;
  return D?.[ko]?.[INDEX[lang]] ?? ko;
}


const DAYS: Record<Lang, string[]> = {
  ko: ["일", "월", "화", "수", "목", "금", "토"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["日", "一", "二", "三", "四", "五", "六"],
};
export const dayName = (lang: Lang, i: number) => DAYS[lang][i];

/** 요일 문자열("12345")을 읽기 좋은 말로 바꾼다. */
export function dayLabel(lang: Lang, days: string): string {
  if (days === "12345") return translate(lang, "평일");
  if (days === "0123456") return translate(lang, "매일");
  const names = [...days].map((c) => DAYS[lang][Number(c)]);
  return lang === "zh" ? `周${names.join("、")}` : names.join(lang === "en" ? " " : "·");
}
