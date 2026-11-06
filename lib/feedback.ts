export const FEEDBACK_CATS: [string, string][] = [
  ["suggest", "건의"],
  ["bug", "불편·오류"],
  ["credit", "크레딧 이관 신청"],
  ["etc", "기타"],
];
export const FEEDBACK_STATUS: [string, string][] = [
  ["new", "접수"],
  ["review", "검토 중"],
  ["done", "반영"],
  ["closed", "답변 완료"],
];
/** 예전에 쓰던 종류(목록에서 빠졌지만 지난 의견에 남아 있음) */
const OLD_CATS: Record<string, string> = { idea: "아이디어" };
export const catLabel = (k: string) => FEEDBACK_CATS.find(([x]) => x === k)?.[1] ?? OLD_CATS[k] ?? k;
/** 워프 크레딧 이관 신청 한 건 상한(관리자가 확인 후 한 번에 지급) */
export const WARP_CREDIT_MAX = 1_000_000;
export const statusLabel = (k: string) => FEEDBACK_STATUS.find(([x]) => x === k)?.[1] ?? k;
