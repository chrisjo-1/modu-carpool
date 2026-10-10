import { db } from "./server";

/** 관리자가 고를 수 있는 푸시 반경(km) */
export const RADIUS_CHOICES = [2, 5, 10] as const;
export const RADIUS_KEYS = { taxi: "push_km_taxi", route: "push_km_route" } as const;
export type RadiusKey = keyof typeof RADIUS_KEYS;
const DEFAULT_KM = 2;

/** 설정된 반경(km). 값이 없거나 허용 밖이면 2km. */
export async function getRadius(key: RadiusKey): Promise<number> {
  try {
    const rows = await db()`select value from settings where key = ${RADIUS_KEYS[key]}`;
    const n = Number(rows[0]?.value);
    return (RADIUS_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_KM;
  } catch {
    return DEFAULT_KM;
  }
}

/** 중심 좌표에서 반경 km를 덮는 사각형(넉넉하게 10% 더 크게). 정확한 거리는 호출한 곳에서 다시 잰다. */
export function boundingBox(lat: number, lng: number, km: number) {
  const dLat = (km / 111) * 1.1;
  const dLng = (km / (111 * Math.cos((lat * Math.PI) / 180))) * 1.1;
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
