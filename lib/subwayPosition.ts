/**
 * 지하철 탑승 위치와 차량 번호 규칙(순수 함수).
 *
 * - 탑승 위치: 승강장 바닥 삼각형 표시의 "칸-문" 번호(예: 6-1 = 6번째 칸 1번 문).
 * - 차량 번호: 열차 안 문 위에 붙은 4자리 번호(예: 2590). 칸마다 고유하다.
 *   두 사람이 같은 번호를 넣으면 같은 칸이다. 번호 해석은 판정에 쓰지 않는다.
 * - 2호선만: 번호 둘째 자리가 칸 위치(0=1번째 칸 … 9=10번째 칸), 첫째·마지막 두 자리가 편성이라는
 *   공개 설명이 있어 "같은 열차의 다른 칸" 안내에만 쓴다. 확정된 규칙이 아니므로 보조 안내로만 쓴다.
 */

export const DOOR_COUNT = 4;
export const DOOR_NUMBERS = Array.from({ length: DOOR_COUNT }, (_, i) => String(i + 1));

export function isDoor(v: string): boolean {
  return /^[1-4]$/.test(v);
}

/** "6", "1" → "6-1". 하나라도 비면 빈 문자열. */
export function positionLabel(car: string, door: string): string {
  return car && door ? `${car}-${door}` : "";
}

export function isCarNo(v: string): boolean {
  return /^\d{4}$/.test(v);
}

export type CarMatch =
  | { kind: "same_car" }
  | { kind: "same_train"; gap: number } // 2호선만. gap = 몇 칸 떨어졌는지
  | { kind: "different" };

/** 두 사람이 넣은 차량 번호를 비교한다. 상대 번호 자체는 밖으로 내보내지 않는다. */
export function compareCarNo(line: string, a: string, b: string): CarMatch {
  if (a === b) return { kind: "same_car" };
  if (line === "2" && a[0] === b[0] && a.slice(2) === b.slice(2)) {
    return { kind: "same_train", gap: Math.abs(Number(a[1]) - Number(b[1])) };
  }
  return { kind: "different" };
}

/** 2호선 차량 번호에서 칸 위치(1~10)를 읽는다. 다른 노선은 규칙을 모르므로 0. */
export function carPositionFromNo(line: string, no: string): number {
  if (line !== "2" || !isCarNo(no)) return 0;
  return Number(no[1]) + 1;
}
