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
