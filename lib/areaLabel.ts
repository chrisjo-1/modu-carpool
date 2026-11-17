/**
 * 장소 이름 아래에 붙이는 작은 지역 글씨("서울 마포구 공덕동").
 * 이름에 이미 동 이름이 들어 있으면 마지막 동을 빼고 보여 준다(같은 말 반복 방지). 클라이언트·서버 공용.
 */
export function areaLabel(name: string, area?: string | null): string {
  const a = (area ?? "").trim();
  if (!a) return "";
  const parts = a.split(" ");
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last && name.includes(last)) return parts.slice(0, -1).join(" ");
  return a;
}

/**
 * 도 단위 짧은 이름(2026-11-17 사용자 지시: '충북·전남·경북처럼 도도 보이게').
 * 지역 글씨는 특별·광역시는 "서울 마포구 공덕동", 도는 "경기 성남시 분당구 정자동"처럼 도를 앞에 붙인다.
 */
export const PROVINCE_SHORT: Record<string, string> = {
  경기도: "경기", 강원특별자치도: "강원", 강원도: "강원", 충청북도: "충북", 충청남도: "충남",
  전북특별자치도: "전북", 전라북도: "전북", 전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주",
};
/** 카카오·OSM의 시·도 이름 → 도 짧은 이름. 목록에 없는 새 이름(통합 등)은 끝의 '특별자치도·통합특별시·도' 등을 뗀다. 특별·광역시는 빈 글자 */
export function provinceShort(name: string): string {
  const n = String(name ?? "").trim();
  if (!n) return "";
  if (PROVINCE_SHORT[n]) return PROVINCE_SHORT[n];
  if (/(특별시|광역시|특별자치시)$/.test(n) && !/통합특별시$/.test(n)) return "";
  return n.replace(/(특별자치도|통합특별시|도)$/, "");
}
const PROVINCE_TOKENS = new Set(Object.values(PROVINCE_SHORT));
/** 지역 글씨 맨 앞의 도 이름을 뗀다("경기 성남시 분당구 정자동" → "성남시 분당구 정자동"). 구 페이지 열쇠 등을 예전과 같게 유지 */
export function withoutProvince(area: string | null | undefined): string {
  const p = String(area ?? "").trim().split(/\s+/).filter(Boolean);
  return p.length >= 3 && PROVINCE_TOKENS.has(p[0]) ? p.slice(1).join(" ") : p.join(" ");
}
