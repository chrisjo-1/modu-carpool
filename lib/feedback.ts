export const FEEDBACK_CATS: [string, string][] = [
  ["suggest", "건의"],
  ["bug", "불편·오류"],
  ["idea", "아이디어"],
  ["etc", "기타"],
];
export const FEEDBACK_STATUS: [string, string][] = [
  ["new", "접수"],
  ["review", "검토 중"],
  ["done", "반영"],
  ["closed", "답변 완료"],
];
export const catLabel = (k: string) => FEEDBACK_CATS.find(([x]) => x === k)?.[1] ?? k;
export const statusLabel = (k: string) => FEEDBACK_STATUS.find(([x]) => x === k)?.[1] ?? k;
