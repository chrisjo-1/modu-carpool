import { getMyTrain, markAlightSent, pendingAlightAlerts, saveAlightAlert } from "./seatDb";
import { seatPush } from "./seatNotify";
import { realtimeLine, realtimeReady, trainPositions } from "./seoulRealtime";
import { routePathVia } from "./subwayRoute";
import { STOP_SEC } from "./trainTiming";

/**
 * 하차 알림(2026-11-13 사용자 지시: "앉았다면 내릴 역 전에 '다음에 내려요, 내릴 준비하세요' 알림").
 * [앉았어요] 때 저장 → 1분마다 예약 실행(`/api/cron/seat-alight`)이 확인:
 *  - 고른 열차가 있으면 서울시 실시간 위치(realtimePosition, 노선당 1번)로 그 열차가 '내리기 전 역'에 오면 보낸다.
 *  - 열차가 없거나 위치를 못 찾으면 예상 시각(지금 + (정거장 수 − 1) × 2분)에 보낸다.
 *    열차 위치를 쓰는 중이라도 예상 시각 + 3분이 지나면 보낸다(위치 정보가 늦거나 열차를 놓친 경우).
 */
export async function setupAlightAlert(userId: string, ride: { line: string; board: string; alight: string; next: string }): Promise<{ alight: string; prev: string } | null> {
  const path = routePathVia(ride.line, ride.board, ride.alight, ride.next || undefined);
  if (!path || path.length < 3) return null; // 바로 다음 역이 내릴 역이면 알릴 틈이 없다
  const prev = path[path.length - 2];
  const train = await getMyTrain(userId).catch(() => null);
  const trainNo = train && train.line === ride.line ? train.trainNo : "";
  const dueAt = Date.now() + Math.max(60, (path.length - 2) * STOP_SEC) * 1000;
  await saveAlightAlert({ userId, line: ride.line, trainNo, alight: ride.alight, prev, dueAt });
  return { alight: ride.alight, prev };
}

const LATE_SEC = 180;

export async function runAlightAlerts(): Promise<{ pending: number; sent: number }> {
  const list = await pendingAlightAlerts();
  if (!list.length) return { pending: 0, sent: 0 };
  // 열차번호가 있는 노선만 위치를 한 번씩 받는다.
  const lines = [...new Set(list.filter((a) => a.trainNo && realtimeLine(a.line)).map((a) => a.line))];
  const where = new Map<string, Map<string, string>>(); // line → trainNo → 지금 역
  if (realtimeReady()) {
    await Promise.all(
      lines.map(async (line) => {
        const pos = await trainPositions(line).catch(() => []);
        where.set(line, new Map(pos.map((p) => [p.trainNo, p.station])));
      }),
    );
  }
  const now = Date.now();
  let sent = 0;
  for (const a of list) {
    const at = a.trainNo ? where.get(a.line)?.get(a.trainNo) : undefined;
    const byPos = at === a.prev || at === a.alight;
    const byTime = at ? now >= a.dueAt + LATE_SEC * 1000 : now >= a.dueAt;
    if (!byPos && !byTime) continue;
    await markAlightSent(a.userId);
    const title = at === a.alight ? `이번 역 ${a.alight}에서 내려요` : `다음 역 ${a.alight}에서 내려요`;
    await seatPush(a.userId, title, "내릴 준비하세요. 앉아 계셨던 자리를 다음 분께 알려 주면 더 좋아요.", "seat-alight");
    sent++;
  }
  return { pending: list.length, sent };
}
