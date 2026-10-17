import { currentUserId, body, fail, json, needLogin, text } from "@/lib/server";
import { readSeatConfig } from "@/lib/seatConfig";
import { closePlan, getMyPlan, seatDbReady, toSubwayPlan, upsertPlan } from "@/lib/seatDb";
import { planProblem, type SubwayPlan } from "@/lib/subway";
import { toMinutes } from "@/lib/seatMatch";

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
    back: b.back === true,
    timeBack: text(b.timeBack, 5),
    carBack: text(b.carBack, 2),
    gateBack: text(b.gateBack, 8),
  };
  const problem = planProblem(p, cfg.pilot);
  if (problem) return json({ error: problem }, 400);
  if (toMinutes(p.timeGo) === null) return json({ error: "출근 탑승 시각을 확인해 주세요." }, 400);
  if (p.back && toMinutes(p.timeBack) === null) return json({ error: "퇴근 출발 시각을 확인해 주세요." }, 400);

  try {
    const saved = await upsertPlan(uid, days, p);
    return json({ plan: toSubwayPlan(saved), days });
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
