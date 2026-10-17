import { ensureSeatSchema, seatSql } from "./seatDb";
import type { FeedbackRow, GuideKey } from "./seatCar";

/** 착석 기록 한 건을 저장한다(회원 번호 없이). */
export async function insertFeedback(k: GuideKey, car: string, entrance: string, seated: boolean): Promise<void> {
  await ensureSeatSchema();
  await seatSql()`insert into seat_feedback (line, station, dir, dow, slot, car, entrance, seated)
    values (${k.line}, ${k.station}, ${k.dir}, ${k.dow}, ${k.slot}, ${car}, ${entrance}, ${seated})`;
}

/** 같은 노선·역·방향·요일·시간대의 착석 기록을 가져온다. */
export async function loadFeedback(k: GuideKey): Promise<FeedbackRow[]> {
  await ensureSeatSchema();
  const rows = await seatSql()`select car, entrance, seated from seat_feedback
    where line = ${k.line} and station = ${k.station} and dir = ${k.dir} and dow = ${k.dow} and slot = ${k.slot}`;
  return rows.map((r) => ({ car: String(r.car), entrance: String(r.entrance), seated: Boolean(r.seated) }));
}
