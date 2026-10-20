import { body, currentUserId, fail, json, needLogin, text } from "@/lib/server";
import { acceptedPartners, clearSpot, getMyPlan, getSpot, seatDbReady, setSpot, type Spot } from "@/lib/seatDb";import { parseKarrotPhoto } from "@/lib/karrot";
import { seatPush } from "@/lib/seatNotify";
import { carCountOf } from "@/lib/subway";
import { doorOfSeat, parseSeat, seatId, seatLabel } from "@/lib/subwayPosition";

export const dynamic = "force-dynamic";

const notReady = () => json({ error: "앉아가기 저장소가 아직 연결되지 않았어요." }, 503);

/** 오늘 내 자리 위치 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  try {
    return json({ spot: await getSpot(uid) });
  } catch (e) {
    return fail(e);
  }
}

/** 오늘 앉은 자리 위치 입력. 수락된 상대에게 알린다. */
export async function PUT(req: Request) {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  const b = await body(req);
  try {
    const plan = await getMyPlan(uid);
    const max = carCountOf(plan?.boardLine ?? "");
    const car = text(b.car, 2);
    const seatPos = parseSeat(text(b.seat, 6));
    // 그림에서 좌석을 고르면 가장 가까운 문을 함께 정한다. 좌석 없이 문만 고를 수도 있다.
    const door = seatPos ? doorOfSeat(seatPos) : text(b.door, 1);
    const side = b.side === "left" || b.side === "right" ? b.side : "";
    const memo = text(b.memo, 80);
    // 힌트 사진(선택): 없으면 그대로 두고, ""면 지우고, JPEG data URL이면 바꾼다.
    let photo: string | undefined;
    if (b.photo === "") photo = "";
    else if (typeof b.photo === "string") {
      const p = parseKarrotPhoto(b.photo);
      if (!p) return json({ error: "사진 파일을 확인해 주세요." }, 400);
      photo = p;
    }
    // 탑승 전 착의 메모: 칸·좌석 없이 메모와 사진만 저장한다. 상대에게는 알리지 않는다(칸이 정해진 뒤 알림).
    if (b.memoOnly === true) {
      const cur = await getSpot(uid);
      await setSpot(uid, { car: cur?.car ?? "", door: cur?.door ?? "", side: cur?.side ?? "", seat: cur?.seat ?? "", memo }, undefined, photo);
      return json({ spot: await getSpot(uid) });
    }
    if (!/^\d{1,2}$/.test(car) || Number(car) < 1 || Number(car) > max) return json({ error: "칸 번호를 골라 주세요." }, 400);
    if (!/^[1-4]$/.test(door)) return json({ error: "앉은 좌석을 그림에서 골라 주세요." }, 400);
    const spot: Spot = { car, door, side, seat: seatPos ? seatId(seatPos) : "", memo };
    await setSpot(uid, spot, undefined, photo);
    const partners = await acceptedPartners(uid);
    const where = seatPos ? `${car}번째 칸 · ${seatLabel(seatPos)}` : `${car}-${door}`;
    await Promise.all(partners.map((p) => seatPush(p, "상대가 자리 위치를 알려 줬어요", `${where}${memo ? ` · 힌트: ${memo}` : ""}`, "seat-spot")));
    return json({ spot: await getSpot(uid) });
  } catch (e) {
    return fail(e);
  }
}

/** 오늘 자리 위치 지우기 */
export async function DELETE() {
  const uid = await currentUserId();
  if (!uid) return needLogin();
  if (!seatDbReady()) return notReady();
  try {
    await clearSpot(uid);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
