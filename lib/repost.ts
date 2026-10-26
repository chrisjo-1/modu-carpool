/** 한국 시간(UTC+9) 기준으로 지난 글과 같은 요일·같은 시각의 다음 출발 시각을 구한다. 30분 안쪽이면 그다음 주. */
const KST = 9 * 3600_000;
const WEEK = 7 * 86400_000;

export function nextSameSlot(departAt: number, now: number = Date.now()): number {
  const d = new Date(departAt + KST);
  const n = new Date(now + KST);
  // 오늘 날짜에 지난 글의 시·분을 붙인 뒤, 요일 차이만큼 옮긴다.
  let t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()) - KST;
  t += ((d.getUTCDay() - n.getUTCDay() + 7) % 7) * 86400_000;
  while (t <= now + 30 * 60_000) t += WEEK;
  return t;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
/** "수요일 08:00" */
export function slotLabel(at: number): string {
  const d = new Date(at + KST);
  return `${DOW[d.getUTCDay()]}요일 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
