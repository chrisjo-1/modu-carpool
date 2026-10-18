export type Post = {
  /** 탑승자가 택시 동승도 찾는 글 */
  taxiShare?: boolean;
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
  /** 출발·도착 지역 이름(시·구·동, 좌표로 계산) */
  originArea?: string;
  destArea?: string;
  /** 운전자 글일 때 작성자의 운전자 등급 */
  ownerTier?: DriverTier | "";
  /** 키워드: 표시용 이름과 묶음(gift·driver·rider), 수정용 id */
  tags?: { label: string; group: string }[];
  tagIds?: string[];
  /** 운전자 글이면 작성자의 차량 사진 */
  carPhoto?: string;
  /** 내 글이 다른 회원에게 보이지 않는 이유 */
  hidden?: "" | "test" | "closed" | "expired" | "blocked";
  ended?: boolean;
  createdAt?: number;
  origin: string;
  dest: string;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  departAt: number;
  seats: number;
  note: string;
  status: "open" | "progress" | "closed";
  mine: boolean;
};

export type Thread = {
  id: string;
  postId: string;
  origin: string;
  dest: string;
  originArea?: string;
  destArea?: string;
  departAt: number;
  cost: "free" | "meter" | "fixed";
  price?: number;
  regular?: boolean;
  days?: string;
  timeGo?: string;
  timeBack?: string;
  otherId?: string;
  otherPhoto?: string;
  /** 상대가 운전자일 때 상대의 운전자 등급 */
  otherTier?: DriverTier | "";
  status: "pending" | "accepted" | "declined";
  message: string;
  iAmOwner: boolean;
  /** 상대의 역할 */
  otherRole?: "driver" | "rider";
  other: string;
  otherBio: string;
  contact: string | null;
  contactType: string;
  /** 별점을 남길 수 있는지(수락됐고 출발 시각이 지났거나 정기카풀)와 내가 준 별점(없으면 0) */
  canRate?: boolean;
  myStars?: number;
  /** 수락된 상대의 차량(등록했을 때만) */
  otherCarNo?: string;
  otherCarPhoto?: string;
  /** 마지막 메시지와 안 읽은 메시지 수 */
  last?: { text: string; image: boolean; mine: boolean; at: number } | null;
  unread?: number;
};

export type User = { id: string; email: string; memberCode?: string; name: string; bio: string; contact: string; contactType: string; photo: string; test?: boolean; notify?: boolean; carNo?: string; carPhoto?: string; gender?: string; rolePref?: string; tier?: DriverTier | ""; verified?: boolean; consented?: boolean; marketing?: boolean; interests?: string[] | null; photoZoom?: boolean };

/** 연락 방법 종류. 값은 DB에 저장되는 키, 표시는 번역해서 보여준다. */
export const CONTACT_TYPES: [string, string][] = [
  ["kakao", "카카오톡 ID"],
  ["line", "LINE ID"],
  ["telegram", "텔레그램 ID"],
  ["wechat", "WeChat ID"],
  ["whatsapp", "WhatsApp ID"],
  ["etc", "기타"],
];
export const contactLabel = (type: string) => CONTACT_TYPES.find(([k]) => k === type)?.[1] ?? "";

/** 신고·차단 사유. 값은 DB에 저장되는 키. "기타"는 직접 적은 내용이 함께 저장된다. */
export const REASONS: [string, string][] = [
  ["noshow", "노쇼"],
  ["rude", "비매너"],
  ["photo", "타인 사진"],
  ["promo", "홍보성"],
  ["illegal", "불법"],
  ["etc", "기타"],
];

/** 다른 회원에게 보이는 프로필 */
export type Member = {
  id: string;
  name: string;
  bio: string;
  photo: string;
  /** 운전자 등급(차량 등록 또는 관리자 지정) */
  tier?: DriverTier | "";
  carPhoto: string;
  me: boolean;
  blockedByMe: boolean;
  rating: { avg: number; count: number };
  /** 이용 횟수(워프 이전 기록 포함) */
  rides?: { total: number; legacy: number };
  /** 워프 이전 기록이 합쳐져 있는지 */
  legacy?: boolean;
  history: { origin: string; dest: string; at: number; regular: boolean; role: "driver" | "rider" }[];
};

export type Place = { name: string; lat: number | null; lng: number | null };

export const METER_URL = process.env.NEXT_PUBLIC_METER_URL || "https://moca-meter.vercel.app";

/** 미터기 기능 노출 여부. 현재 버전에서는 숨김(true로 바꾸면 비용 선택과 미터기 링크가 다시 나타난다). */
export const SHOW_METER = false;

/** 숨긴 미터기 선택은 무료로 본다(기존 미터기 게시물도 같은 방식으로 표시). */

/** 가입하게 된 경로(가입 때 한 번 고른다). 값은 저장용 코드, 뒤는 화면 문구. */
export const JOIN_SOURCES: [string, string][] = [["member", "기존 회원 소개"], ["warp", "워프(풀럭) 기존 회원"], ["search", "검색"], ["friend", "지인 추천"], ["other", "기타"]];

/** 운전자 등급. 브론즈는 자동 부여, 실버·골드는 당분간 관리자가 지정한다(users.tier_set). */
export type DriverTier = "bronze" | "silver" | "gold";

/**
 * 운전자 등급을 계산한다(저장하지 않고 항상 현재 상태로 판정).
 * 브론즈 = 차량번호 + 차량 사진 + 프로필 사진. 프로필 사진이 본인 얼굴인지는 자동으로 알 수 없어서,
 * 타인 사진이 신고되면 이용이 정지될 수 있다고 안내한다.
 */
export const driverTier = (u: { carNo?: string; carPhoto?: string; photo?: string; tierSet?: string | null } | null | undefined): DriverTier | "" =>
  u?.tierSet === "silver" || u?.tierSet === "gold" ? u.tierSet : u?.carNo && u?.carPhoto && u?.photo ? "bronze" : "";

export const TIER_LABEL: Record<DriverTier, string> = { bronze: "브론즈", silver: "실버", gold: "골드" };

/**
 * 기본 역할: 프로필의 희망 역할을 먼저 따른다(탑승자면 탑승자, 운전자면 차량 등록이 있을 때만 운전자).
 * 희망 역할을 정하지 않았다면 차량 번호와 차량 사진을 모두 등록한 회원은 운전자, 아니면 탑승자.
 */
export const defaultRoleFor = (u: { carNo?: string; carPhoto?: string; rolePref?: string } | null | undefined): "driver" | "rider" => {
  const registered = !!(u?.carNo && u?.carPhoto);
  if (u?.rolePref === "rider") return "rider";
  if (u?.rolePref === "driver" && registered) return "driver";
  return registered ? "driver" : "rider";
};

/** 글이 다른 회원 목록에 보이지 않는 이유 안내(홈 글 상세·내 정보 공용). */
export const HIDDEN_TEXT: Record<string, string> = {
  test: "테스트 회원으로 쓴 글이라 실제 회원에게는 보이지 않아요.",
  closed: "마감한 글이라 다른 회원 목록에 보이지 않아요.",
  expired: "종료된 지 7일이 지나 목록에서 내려갔어요.",
  blocked: "이용이 정지된 계정이라 글이 보이지 않아요.",
};
