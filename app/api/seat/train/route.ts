import { currentUserId, fail, json, needLogin, text } from "@/lib/server";
import { clearMyTrain, getMyTrain, saveMyTrain, sameTrainUsers, seatDbReady } from "@/lib/seatDb";
import { arrivalsAt, realtimeLine, realtimeReady } from "@/lib/seoulRealtime";
import { LINE_STATIONS } from "@/lib/subway";

export const dynamic = "force-dynamic";

/**
 * 오늘 탄 열차(같은 열차 매칭, 2026-11-12).
 * GET ?line=&board=&next=  내 역에 들어오거나 막 떠난 열차(최대 4) + 오늘 고른 열차·같은 열차 회원 수
 * POST {line, trainNo, terminal, station}  오늘 탄 열차로 저장 / DELETE 지우기
 */
export async function GET(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  const sp = new URL(req.url).searchParams;
  const line = sp.get("line") ?? "";
  const board = sp.get("board") ?? "";
  const next = sp.get("next") ?? "";
  try {
    const mine = await getMyTrain(uid);
    const same = mine ? (await sameTrainUsers(uid)).length : 0;
    if (!realtimeReady() || !realtimeLine(line)) return json({ supported: false, trains: [], mine, same });
    if (!(LINE_STATIONS[line] ?? []).includes(board)) return json({ supported: true, trains: [], mine, same });
    const trains = await arrivalsAt(line, board, next || undefined).catch((e: Error) => {
      throw Object.assign(new Error(e.message), { status: 502 });
    });
    return json({ supported: true, trains, mine, same });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 502) return json({ error: err.message }, 502);
    return fail(e);
  }
}

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const line = text(b.line, 20);
    const trainNo = text(b.trainNo, 10);
    const station = text(b.station, 30);
    if (!realtimeLine(line) || !/^[0-9A-Za-z]{1,6}$/.test(trainNo)) return json({ error: "열차를 목록에서 골라 주세요." }, 400);
    if (station && !(LINE_STATIONS[line] ?? []).includes(station)) return json({ error: "역을 목록에서 골라 주세요." }, 400);
    await saveMyTrain(uid, { line, trainNo, terminal: text(b.terminal, 30), station });
    const same = (await sameTrainUsers(uid)).length;
    return json({ mine: await getMyTrain(uid), same });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
  try {
    await clearMyTrain(uid);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
