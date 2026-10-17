// 지하철 앉아가기 푸시 알림. 누르면 지하철 메뉴가 열린다. 실패해도 본래 동작은 계속된다.
import { sendPush } from "./push";

const URL = "/?tab=subway";

export function seatPush(userId: string, title: string, body: string, tag = "seat") {
  return sendPush(userId, { title, body, url: URL, tag }).catch(() => 0);
}
