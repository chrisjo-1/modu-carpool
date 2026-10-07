export type Post = {
  id: string;
  owner: string;
  ownerBio: string;
  role: "driver" | "rider";
  kind: "commute" | "trip";
  cost: "free" | "meter";
  origin: string;
  dest: string;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  departAt: number;
  seats: number;
  note: string;
  status: "open" | "closed";
  mine: boolean;
};

export type Thread = {
  id: string;
  postId: string;
  origin: string;
  dest: string;
  departAt: number;
  cost: "free" | "meter";
  status: "pending" | "accepted" | "declined";
  message: string;
  iAmOwner: boolean;
  other: string;
  otherBio: string;
  contact: string | null;
  contactType: string;
};

export type User = { id: string; email: string; name: string; bio: string; contact: string; contactType: string };

/** 연락 방법 종류. 값은 DB에 저장되는 키, 표시는 번역해서 보여준다. */
export const CONTACT_TYPES: [string, string][] = [
  ["kakao", "카카오톡 ID"],
  ["phone", "전화번호"],
  ["line", "LINE"],
  ["wechat", "WeChat"],
  ["whatsapp", "WhatsApp"],
  ["telegram", "Telegram"],
  ["etc", "기타"],
];
export const contactLabel = (type: string) => CONTACT_TYPES.find(([k]) => k === type)?.[1] ?? "";

export type Place = { name: string; lat: number | null; lng: number | null };

export const METER_URL = process.env.NEXT_PUBLIC_METER_URL || "https://moca-meter.vercel.app";
