/** 말풍선 목록과 기본 문구(클라이언트·관리자 공용). DB 기능은 lib/bubbles.ts에 있다. */
export const BUBBLES: { id: string; where: string; text: string }[] = [
  { id: "C930", where: "홈 상단 · 역할 스위치", text: "지금 내 기본 역할이에요. 누르면 운전자와 탑승자가 바뀌고, 카풀을 올릴 때 기본값이 돼요." },
  { id: "C931", where: "목록 · 지도 버튼", text: "지도에서 글의 출발지 위치를 볼 수 있어요." },
  { id: "C932", where: "목록 · 가까운 순 정렬", text: "가까운 순은 내 위치를 허용하면 쓸 수 있어요. 출발지가 가까운 글부터 보여요." },
  { id: "C933", where: "CALL 버튼 위", text: "주변 운전자에게 바로 호출을 보내요. 하루 횟수가 정해져 있어요." },
];

export const BUBBLE_MAX = 120;

/** 저장할 문구만 골라 담는다. 알 수 없는 번호와 빈 문구는 버린다(빈 문구는 기본 문구를 쓴다). */
export function cleanBubbleTexts(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object") return out;
  for (const b of BUBBLES) {
    const s = String((v as Record<string, unknown>)[b.id] ?? "").trim();
    if (s) out[b.id] = s;
  }
  return out;
}
