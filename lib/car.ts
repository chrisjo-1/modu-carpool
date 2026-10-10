import { grant } from "./credits";
import { db } from "./server";

export const CAR_REQUIRED = "운전자 글은 차량을 먼저 등록해야 올릴 수 있어요. 내 정보에서 차량번호와 차량 사진을 등록해 주세요.";

/** 차량번호와 차량 사진이 모두 있으면 운전자 등록이 끝난 것으로 본다. */
export async function carReady(userId: string): Promise<boolean> {
  const r = await db()`select (car_no <> '') as has_no, (car_v > 0) as has_photo from users where id = ${userId}`;
  return r.length > 0 && r[0].has_no === true && r[0].has_photo === true;
}

/** 운전자 등록이 끝났으면 축하 크레딧을 한 번만 준다(이미 받았으면 0). */
export async function grantCarIfReady(userId: string): Promise<number> {
  return (await carReady(userId)) ? grant(userId, "car") : 0;
}
