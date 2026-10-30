/**
 * 정기카풀 계약서(2026-10-30 사용자 지시: 이름 '계약서', 서명은 앱 동의, 비용 상한 없음).
 * 화면과 서버가 함께 쓰는 항목·기본값·검사·고정 조항.
 */
export type CostType = "ride" | "month";
export type ContractTerms = {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  autoRenew: boolean;
  origin: string;
  dest: string;
  pickup: string; // 탑승 지점
  dropoff: string; // 하차 지점
  days: string; // "12345" (0=일)
  timeGo: string; // HH:MM
  timeBack: string; // 돌아오는 길(없으면 "")
  waitMin: number; // 기다려 주는 시간(분)
  costType: CostType;
  amount: number; // 원
  settle: string; // 정산 방법(예: 매월 1일 계좌이체 선불)
  cancelNotice: string; // 취소 통보 시한
  noShow: string; // 알리지 않고 불참했을 때
  terminateDays: number; // 중도 해지 통보 기간(일)
  extra: string; // 추가 약속
};

export const CANCEL_OPTIONS = ["전날 밤 9시까지", "당일 출발 1시간 전까지", "당일 출발 30분 전까지"];
export const NOSHOW_OPTIONS = ["그 회 비용을 그대로 부담해요", "그 회 비용의 절반을 부담해요", "부담하지 않아요(다음부터 주의)"];

const pad = (n: number) => String(n).padStart(2, "0");
/** 한국 시각 기준 날짜 YYYY-MM-DD */
export function kstDate(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** 시작일에서 한 달 뒤 하루 전(예: 11-01 → 11-30) */
export function monthEnd(start: string) {
  const [y, m, d] = start.split("-").map(Number);
  const e = new Date(Date.UTC(y, m, d) - 86_400_000);
  return `${e.getUTCFullYear()}-${pad(e.getUTCMonth() + 1)}-${pad(e.getUTCDate())}`;
}

export function defaultTerms(p: { origin: string; dest: string; days?: string; timeGo?: string; timeBack?: string; price?: number }): ContractTerms {
  const start = kstDate(Date.now() + 86_400_000);
  return {
    startDate: start,
    endDate: monthEnd(start),
    autoRenew: false,
    origin: p.origin,
    dest: p.dest,
    pickup: p.origin,
    dropoff: p.dest,
    days: p.days || "12345",
    timeGo: p.timeGo || "08:00",
    timeBack: p.timeBack || "",
    waitMin: 5,
    costType: "ride",
    amount: Math.max(0, Math.round(p.price ?? 0)),
    settle: "매주 금요일 계좌이체(후불)",
    cancelNotice: CANCEL_OPTIONS[0],
    noShow: NOSHOW_OPTIONS[0],
    terminateDays: 7,
    extra: "",
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 받은 값을 검사해 정리한다. 문제가 있으면 error 문구. */
export function cleanTerms(v: unknown): { terms?: ContractTerms; error?: string } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const t: ContractTerms = {
    startDate: str(o.startDate, 10),
    endDate: str(o.endDate, 10),
    autoRenew: o.autoRenew === true,
    origin: str(o.origin, 80),
    dest: str(o.dest, 80),
    pickup: str(o.pickup, 80),
    dropoff: str(o.dropoff, 80),
    days: [...new Set(str(o.days, 7).split("").filter((c) => /[0-6]/.test(c)))].sort().join(""),
    timeGo: str(o.timeGo, 5),
    timeBack: str(o.timeBack, 5),
    waitMin: Math.min(60, Math.max(0, Math.round(Number(o.waitMin) || 0))),
    costType: o.costType === "month" ? "month" : "ride",
    amount: Math.min(10_000_000, Math.max(0, Math.round(Number(o.amount) || 0))),
    settle: str(o.settle, 100),
    cancelNotice: str(o.cancelNotice, 60),
    noShow: str(o.noShow, 60),
    terminateDays: Math.min(60, Math.max(0, Math.round(Number(o.terminateDays) || 0))),
    extra: typeof o.extra === "string" ? o.extra.trim().slice(0, 500) : "",
  };
  if (!DATE.test(t.startDate) || !DATE.test(t.endDate)) return { error: "계약 기간을 확인해 주세요." };
  if (t.endDate < t.startDate) return { error: "끝나는 날이 시작일보다 빠를 수 없어요." };
  if (!t.pickup || !t.dropoff) return { error: "탑승 지점과 하차 지점을 적어 주세요." };
  if (!t.days) return { error: "요일을 하나 이상 골라 주세요." };
  if (!TIME.test(t.timeGo)) return { error: "출발 시각을 확인해 주세요." };
  if (t.timeBack && !TIME.test(t.timeBack)) return { error: "돌아오는 시각을 확인해 주세요." };
  if (!t.settle) return { error: "정산 방법을 적어 주세요." };
  return { terms: t };
}

/**
 * 법정 출퇴근 시간대(평일 07:00~09:00, 18:00~20:00, 주말·공휴일 제외) 밖에 비용을 받으면 경고.
 * 여객자동차운수사업법 제81조(2019 개정). 막지는 않는다(사용자 지시: 비용 상한 불필요).
 */
export function legalWarnings(t: Pick<ContractTerms, "days" | "timeGo" | "timeBack" | "amount">): string[] {
  if (!t.amount) return [];
  const out: string[] = [];
  if (/[06]/.test(t.days)) out.push("토·일요일은 법정 출퇴근 시간이 아니라 비용을 받을 수 없어요.");
  const inWindow = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    const x = h * 60 + m;
    return (x >= 420 && x <= 540) || (x >= 1080 && x <= 1200);
  };
  if (t.timeGo && !inWindow(t.timeGo)) out.push(`출발 ${t.timeGo}은 법정 출퇴근 시간(오전 7~9시, 오후 6~8시) 밖이에요.`);
  if (t.timeBack && !inWindow(t.timeBack)) out.push(`돌아오는 ${t.timeBack}은 법정 출퇴근 시간(오전 7~9시, 오후 6~8시) 밖이에요.`);
  return out;
}

/** 모든 계약서에 들어가는 고정 조항 */
export const FIXED_CLAUSES = [
  "이 카풀은 영업이 아닌 출퇴근 비용(기름값·통행료 등 실비)을 나누는 약속입니다. 여객자동차운수사업법에 따라 유상 카풀은 평일 출퇴근 시간(오전 7~9시, 오후 6~8시)에만 할 수 있습니다.",
  "운전자는 안전 운전하고 음주·과로 운전을 하지 않습니다. 탑승자는 안전벨트를 매고, 차 안에서 흡연하지 않습니다.",
  "약속한 사람 외의 동승자를 태우거나 데려올 때는 미리 서로 동의를 받습니다.",
  "사고가 나면 운전자의 자동차보험으로 처리합니다. 운전자는 계약 기간 동안 유효한 자동차보험(동승자 보상 포함)을 유지합니다.",
  "모두의카풀은 회원을 연결하는 서비스이며 운송의 당사자가 아닙니다.",
  "상대의 연락처·주소 등 개인정보는 이 카풀 약속 외의 목적으로 쓰지 않습니다.",
  "문제가 생기면 먼저 서로 협의하고, 필요하면 모두의카풀에 신고해 대화·계약서 기록을 확인받을 수 있습니다.",
];

export const STATUS_LABEL: Record<string, string> = { proposed: "동의 대기", signed: "체결", superseded: "이전 판", ended: "해지", cancelled: "취소" };
