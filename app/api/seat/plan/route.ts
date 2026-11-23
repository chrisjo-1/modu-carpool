import { currentUserId, body, ensureSchema, fail, json, needLogin, text } from "@/lib/server";
import { readSeatConfig } from "@/lib/seatConfig";
import { closePlan, getMyPlan, listCandidates, seatDbReady, toSubwayPlan, upsertPlan } from "@/lib/seatDb";
import { grant } from "@/lib/credits";
import { seatPush } from "@/lib/seatNotify";
import { planProblem, type SubwayPlan } from "@/lib/subway";
import { toMinutes, tripViews } from "@/lib/seatMatch";
import { headingsAt } from "@/lib/subwayRoute";

export const dynamic = "force-dynamic";

const notReady = () => json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);
const closed = () => json({ error: "앉아가기는 아직 준비 중이에요." }, 403);

/** 내 앉아가기 등록 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  try {
    const p = await getMyPlan(uid);
    return json({ plan: p ? toSubwayPlan(p) : null, days: p?.days ?? "" });
  } catch (e) {
    return fail(e);
  }
}

/** 등록 저장. 관리자가 앉아가기를 열어 둔 때만 받는다. */
export async function PUT(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const cfg = await readSeatConfig();
  if (!cfg.enabled) return closed();

  const b = await body(req);
  const days = text(b.days, 7);
  if (!/^[0-6]{1,7}$/.test(days)) return json({ error: "출퇴근 요일을 골라 주세요." }, 400);
  const p: SubwayPlan = {
    boardLine: text(b.boardLine, 20),
    board: text(b.board, 20),
    alightLine: text(b.alightLine, 20),
    alight: text(b.alight, 20),
    timeGo: text(b.timeGo, 5),
    car: text(b.car, 2),
    gate: text(b.gate, 8),
    go: b.go !== false,
    back: b.back === true,
    transfer: text(b.transfer, 20),
    timeBack: text(b.timeBack, 5),
    carBack: text(b.carBack, 2),
    gateBack: text(b.gateBack, 8),
    boardNext: text(b.boardNext, 20),
    backNext: text(b.backNext, 20),
  };
  const problem = planProblem(p, cfg.pilot);
  if (problem) return json({ error: problem }, 400);
  // 방면은 탑승역 바로 옆 역이어야 한다(아니면 비워서 기본 방향을 쓴다).
  if (p.boardNext && !headingsAt(p.boardLine, p.board).some((h) => h.next === p.boardNext)) p.boardNext = "";
  if (p.back && p.backNext && !headingsAt(p.alightLine, p.alight).some((h) => h.next === p.backNext)) p.backNext = "";

  try {
    const before = await getMyPlan(uid);
    const saved = await upsertPlan(uid, days, p);
    // 처음 등록하면 크레딧을 한 번 지급한다(이미 받았으면 0).
    const credit = await ensureSchema().then(() => grant(uid, "subway")).catch(() => 0);
    // 새로 등록했거나 경로·시각·요일이 바뀌었으면, 자리를 나눌 수 있는 상대에게 자동으로 알린다.
    const changed = !before || before.boardStation !== saved.boardStation || before.alightStation !== saved.alightStation || before.timeGo !== saved.timeGo || before.days !== saved.days || before.go !== saved.go || before.back !== saved.back || before.transfer !== saved.transfer || before.timeBack !== saved.timeBack;
    let matches = 0;
    if (changed) {
      // 출근·퇴근(고른 것만), 환승하면 같은 노선 구간으로 본다
      const cands = (await Promise.all(tripViews(saved).map((v) => listCandidates(v)))).flat();
      const users = [...new Set(cands.map((c) => c.userId))];
      matches = users.length;
      await Promise.all(users.map((u) => seatPush(u, "자리를 나눌 수 있는 분이 등록했어요", "1~3정거장 안에서 자리를 나눌 수 있어요. 지하철 메뉴에서 확인해 주세요.", "seat-new")));
    }
    return json({ plan: toSubwayPlan(saved), days, credit, matches });
  } catch (e) {
    return fail(e);
  }
}

/** 등록 해제 */
export async function DELETE() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  try {
    await closePlan(uid);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
