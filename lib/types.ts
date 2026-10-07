export type Post = {
  id: string;
  /** 작성자 회원 id (차단할 때 쓴다) */
  ownerId?: string;
  owner: string;
  ownerBio: string;
  role: "driver" | "rider";
  kind: "commute" | "trip";
  cost: "free" | "meter" | "fixed";
  /** cost 가 fixed 일 때 1인 금액(원) */
  price?: number;
  /** 정기카풀 여부와 일정 */
  regular?: boolean;
  days?: string;
  timeGo?: string;
  timeBack?: string;
  ownerPhoto?: string;
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
  cost: "free" | "meter" | "fixed";
  price?: number;
  regular?: boolean;
  days?: string;
  timeGo?: string;
  timeBack?: string;
  otherId?: string;
  otherPhoto?: string;
  status: "pending" | "accepted" | "declined";
  message: string;
  iAmOwner: boolean;
  other: string;
  otherBio: string;
  contact: string | null;
  contactType: string;
  /** 별점을 남길 수 있는지(수락됐고 출발 시각이 지났거나 정기카풀)와 내가 준 별점(없으면 0) */
  canRate?: boolean;
  myStars?: number;
};

export type User = { id: string; email: string; name: string; bio: string; contact: string; contactType: string; photo: string };

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

/** 신고·차단 사유. 값은 DB에 저장되는 키. "기타"는 직접 적은 내용이 함께 저장된다. */
export const REASONS: [string, string][] = [
  ["noshow", "노쇼"],
  ["rude", "비매너"],
  ["promo", "홍보성"],
  ["illegal", "불법"],
  ["etc", "기타"],
];
export const reasonLabel = (key: string) => REASONS.find(([k]) => k === key)?.[1] ?? "";

/** 다른 회원에게 보이는 프로필 */
export type Member = {
  id: string;
  name: string;
  bio: string;
  photo: string;
  me: boolean;
  blockedByMe: boolean;
  rating: { avg: number; count: number };
  history: { origin: string; dest: string; at: number; regular: boolean; role: "driver" | "rider" }[];
};

export type Place = { name: string; lat: number | null; lng: number | null };

export const METER_URL = process.env.NEXT_PUBLIC_METER_URL || "https://moca-meter.vercel.app";
