/**
 * 회원 고유코드: 숫자 7자리 + 영문 대문자 1자리(맨 끝). 헷갈리는 I, O 는 뺀다.
 * 가입과 동시에 자동 배정하며, 기존 워프 회원이 받은 번호는 그대로 둔다.
 */
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // A–Z 에서 I, O 제외 (24자)

export function makeMemberCode(): string {
  const b = new Uint32Array(8);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < 7; i++) s += String(b[i] % 10);
  return s + LETTERS[b[7] % LETTERS.length];
}

/** 고유코드 중복(23505)인지 확인해, 중복이면 다시 뽑게 한다. */
export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";
