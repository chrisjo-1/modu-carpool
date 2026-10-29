import { db } from "./server";

/** 앱 설치 안내: off(끄기) · nudge(권유, 닫을 수 있음) · require(필수, 닫기 없음) */
export type InstallGate = "off" | "nudge" | "require";

/** 관리자가 켜는 기능 설정을 한 번에 읽는다(settings repost_on · install_gate). */
export async function features(): Promise<{ repostOn: boolean; installGate: InstallGate }> {
  try {
    const r = await db()`select key, value from settings where key in ('repost_on', 'install_gate')`;
    const m = new Map(r.map((x) => [String(x.key), String(x.value)]));
    const g = m.get("install_gate");
    return { repostOn: m.get("repost_on") === "1", installGate: g === "nudge" || g === "require" ? g : "off" };
  } catch {
    return { repostOn: false, installGate: "off" };
  }
}

/** 다시 올리기 버튼·하루 전 알림: 관리자가 '정책 적용'을 눌러야 가동한다(settings repost_on = '1'). */
export async function repostOn(): Promise<boolean> {
  return (await features()).repostOn;
}
