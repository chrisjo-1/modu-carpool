/** 출퇴근 시간대·정기 일정 계산. 서버와 화면이 같은 규칙을 쓰도록 한 곳에 둔다. 기준은 한국 시간(KST). */
const KST = 9 * 3600_000;
export const MAX_PRICE = 50000;

/** 한국 시간 기준 요일(0=일)과 자정부터의 분 */
export function kstParts(ms: number): { day: number; minutes: number } {
  const d = new Date(ms + KST);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export const toMinutes = (hhmm: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

/** 오전 7~9시 또는 오후 6~8시 */
export const inCommuteWindow = (minutes: number) => (minutes >= 420 && minutes <= 540) || (minutes >= 1080 && minutes <= 1200);
const weekday = (day: number) => day >= 1 && day <= 5;

/** 한 번짜리 글: 평일 출퇴근 시간대 출발이면 금액을 적을 수 있다. */
export function priceAllowedAt(ms: number): boolean {
  if (!Number.isFinite(ms)) return false;
  const p = kstParts(ms);
  return weekday(p.day) && inCommuteWindow(p.minutes);
}

/** 정기카풀: 요일이 모두 평일이고 출근(·퇴근) 출발 시각이 시간대 안이면 금액을 적을 수 있다. */
export function priceAllowedRegular(days: string, timeGo: string, timeBack: string): boolean {
  if (!days || ![...days].every((c) => weekday(Number(c)))) return false;
  if (!inCommuteWindow(toMinutes(timeGo))) return false;
  return !timeBack || inCommuteWindow(toMinutes(timeBack));
}

export const validDays = (days: unknown): days is string =>
  typeof days === "string" && /^[0-6]{1,7}$/.test(days) && new Set(days).size === days.length;

/** 정기 일정의 다음 출발 시각(ms). 요일 문자열 예: "12345" */
export function nextOccurrence(days: string, hhmm: string, now = Date.now()): number {
  const min = Math.max(0, toMinutes(hhmm));
  const base = new Date(now + KST);
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i, 0, min));
    const ms = d.getTime() - KST;
    if (days.includes(String(d.getUTCDay())) && ms > now - 30 * 60_000) return ms;
  }
  return now;
}
