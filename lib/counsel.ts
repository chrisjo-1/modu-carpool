/**
 * 마음 상담: 유형·질문·점수 계산과 상담 가능 시간 계산(화면·서버 공용, 서버 전용 모듈을 쓰지 않는다).
 * 안내 문구: 정성스럽게 상담해 드리고, 상담 내용은 기록으로 남기지 않는다(CARE_TEXT).
 * 문항은 공개 표준 척도(PHQ-9 우울, GAD-7 불안, PHQ-4 간이)를 쉬운 말로 옮겼다. 결과는 진단이 아니다.
 */

export const CARE_TEXT = "정성스럽게 상담해 드리고, 상담 내용은 기록으로 남기지 않아요.";

export type Topic ="work" | "mood" | "anxiety" | "relation" | "other";
/** 문항 묶음: phq9(우울)·gad7(불안)·phq4(기타 간이) = 표준 척도, stress·relation = 자체 참고 문항 */
export type Scale = "phq9" | "gad7" | "phq4" | "stress" | "relation";
export type Level = "good" | "mild" | "moderate" | "high";

export const TOPICS: { id: Topic; label: string; desc: string }[] = [
  { id: "work", label: "스트레스", desc: "일, 생활, 사람 때문에 지친 마음" },
  { id: "mood", label: "우울·무기력", desc: "기운이 없고 즐거움이 줄었어요" },
  { id: "anxiety", label: "불안·걱정", desc: "걱정이 멈추지 않아요" },
  { id: "relation", label: "관계·가족", desc: "가족, 연인, 동료와의 관계" },
  { id: "other", label: "기타", desc: "어디서부터 말해야 할지 모르겠어요" },
];

export const TOPIC_LABEL: Record<Topic, string> = Object.fromEntries(TOPICS.map((t) => [t.id, t.label])) as Record<Topic, string>;

/** 지난 2주 동안 며칠이나(표준 척도의 0~3점: 전혀·며칠·절반 이상·거의 매일) */
export const CHOICES = ["그런 날 없었어요", "며칠 (1~6일)", "절반 넘게 (7~11일)", "거의 매일 (12일 이상)"];
/** 질문 위 안내. 질문은 모두 "~한 날"로 써서 답(그런 날 없었어요·며칠…)과 이중부정이 생기지 않게 한다. */
export const QUIZ_GUIDE = "지난 2주(14일) 동안 이런 날이 며칠이었나요?";

// 표준 문항(PHQ-9·GAD-7)의 뜻은 그대로 두고, 부정문 없이 "~한 날"로 다듬었다.
const PHQ = [
  "평소 좋아하던 일에도 흥미가 사라진 날",
  "기분이 가라앉고 우울하거나, 앞날이 막막하게 느껴진 날",
  "잠들기 어렵거나 자주 깬 날, 또는 너무 많이 잔 날",
  "몸이 무겁고 쉽게 지친 날",
  "입맛이 떨어진 날, 또는 평소보다 너무 많이 먹은 날",
  "'나는 실패했다', '가족을 실망시켰다'처럼 나를 탓한 날",
  "책·영상·일에 집중하기 어려웠던 날",
  "말이나 움직임이 눈에 띄게 느려진 날, 또는 안절부절 가만히 있기 힘든 날",
];
const GAD = [
  "초조하고 불안해서 마음이 조마조마한 날",
  "걱정을 멈추려 해도 걱정이 계속 이어진 날",
  "여러 가지 일을 지나치게 걱정한 날",
  "마음 편히 쉬기 어려웠던 날",
  "안절부절해서 가만히 앉아 있기 힘든 날",
  "평소보다 쉽게 짜증이 나거나 화가 난 날",
  "곧 나쁜 일이 생길 것 같아 두려운 날",
];
// 스트레스·관계는 표준 척도가 아니라 모두의카풀이 만든 참고용 문항(같은 "~한 날"·날수 4단계 틀)
const STRESS = [
  "할 일이 너무 많아 감당하기 벅차다고 느낀 날",
  "예상하지 못한 일 때문에 마음이 크게 흔들린 날",
  "일이나 생활이 뜻대로 되지 않아 답답했던 날",
  "사소한 일에도 신경이 곤두서고 예민해진 날",
  "머리가 아프거나 어깨가 뭉치는 등 몸이 긴장한 날",
  "쉬는 시간에도 일이나 걱정거리가 머릿속을 떠나지 않은 날",
];
const RELATION = [
  "가족이나 가까운 사람과 말다툼하거나 부딪힌 날",
  "내 마음을 털어놓을 사람이 없다고 느낀 날",
  "주변 사람에게 서운하거나 섭섭한 마음이 든 날",
  "누군가의 눈치를 보느라 마음이 지친 날",
  "사람들과 함께 있어도 외롭다고 느낀 날",
  "관계 때문에 잠들기 어렵거나 그 일이 계속 떠오른 날",
];
/** 위기 문항. 모든 유형에서 마지막에 묻는다(점수와 별도로 1 이상이면 관리자 메일에 [긴급]). PHQ-9에서는 9번 문항으로 점수에도 들어간다. */
export const CRISIS_Q = "'차라리 사라지고 싶다'거나 스스로를 해치고 싶은 생각이 든 날";

export const scaleOf = (t: Topic): Scale =>
  t === "mood" ? "phq9" : t === "anxiety" ? "gad7" : t === "work" ? "stress" : t === "relation" ? "relation" : "phq4";
const ITEMS: Record<Scale, string[]> = { phq9: PHQ, gad7: GAD, phq4: [PHQ[1], GAD[0], PHQ[0], GAD[1]], stress: STRESS, relation: RELATION };

/** 유형별 질문(마지막은 항상 위기 문항) */
export function questionsFor(t: Topic): string[] {
  return [...ITEMS[scaleOf(t)], CRISIS_Q];
}

// 표준 척도는 표준 기준점, 자체 문항(6문항·18점 만점)은 같은 비율(약 20%·40%·60%)로 나눈다
const CUTS: Record<Scale, [number, number, number]> = { phq9: [5, 10, 15], gad7: [5, 10, 15], phq4: [3, 6, 9], stress: [4, 8, 11], relation: [4, 8, 11] };
const MAX: Record<Scale, number> = { phq9: 27, gad7: 21, phq4: 12, stress: 18, relation: 18 };

export const LEVEL_LABEL: Record<Level, string> = { good: "양호", mild: "가벼운 주의", moderate: "주의", high: "관심 필요" };
export const LEVEL_TEXT: Record<Level, string> = {
  good: "요즘 마음 상태는 비교적 안정적이에요. 그래도 이야기하고 싶은 일이 있다면 편하게 예약해 주세요.",
  mild: "조금 지쳐 있는 것 같아요. 혼자 버티기보다 한 번 털어놓으면 한결 가벼워질 수 있어요.",
  moderate: "마음이 꽤 힘든 상태로 보여요. 상담으로 이야기를 나눠 보시길 권해요.",
  high: "많이 힘드신 것 같아요. 혼자 견디지 말고 편하게 이야기 나눠요.",
};

/** 화면 이름 */
export const INDEX_NAME = "나의 스트레스 지수";
export const CHECK_NAME = "나의 스트레스 지수 체크";
/** 연락처 안내(전화번호는 받지 않음) */
export const PRIVACY_TEXT = "전화번호는 받지 않아요. 비밀은 철저히 지켜요.";

export type Result = { scale: Scale; score: number; max: number; index: number; level: Level; crisis: boolean };

/** 답(0~3)으로 점수를 낸다. 답 개수가 맞지 않으면 null. index는 스트레스 지수 0~100(높을수록 스트레스가 큼). */
export function scoreAnswers(t: Topic, answers: unknown): Result | null {
  const qs = questionsFor(t);
  if (!Array.isArray(answers) || answers.length !== qs.length) return null;
  const a = answers.map((v) => Number(v));
  if (a.some((v) => !Number.isInteger(v) || v < 0 || v > 3)) return null;
  const scale = scaleOf(t);
  const crisisAnswer = a[a.length - 1];
  // PHQ-9은 위기 문항까지 9문항 모두 점수, 나머지는 위기 문항을 점수에서 뺀다
  const scored = scale === "phq9" ? a : a.slice(0, -1);
  const score = scored.reduce((s, v) => s + v, 0);
  const max = MAX[scale];
  const [c1, c2, c3] = CUTS[scale];
  const level: Level = score < c1 ? "good" : score < c2 ? "mild" : score < c3 ? "moderate" : "high";
  return { scale, score, max, index: Math.round((score / max) * 100), level, crisis: crisisAnswer > 0 };
}

/** 연락 방법: SNS 또는 메일(전화번호는 받지 않는다) */
export type Method = "kakao" | "instagram" | "sns" | "email";
export const METHODS: [Method, string][] = [["kakao", "카카오톡"], ["instagram", "인스타그램"], ["sns", "기타 SNS"], ["email", "메일로 연락"]];
export const METHOD_LABEL: Record<Method, string> = Object.fromEntries(METHODS) as Record<Method, string>;
export const METHOD_HINT: Record<Method, string> = { kakao: "카카오톡 아이디", instagram: "인스타그램 아이디 (@없이)", sns: "어떤 SNS인지와 아이디 (예: 텔레그램 abc123)", email: "" };

/** 휴대폰·전화번호처럼 보이는지(숫자 9자리 이상이 주를 이루면 거절) */
export const looksLikePhone = (s: string) => {
  const digits = s.replace(/\D/g, "");
  return digits.length >= 9 && digits.length >= s.replace(/[\s\-+().]/g, "").length - 2;
};

/** 상담 가능 시간 설정(관리자). weekly: 요일(0=일)별 시작 시각 "HH:MM" 목록 */
export type CounselConfig = { on: boolean; days: number; leadHours: number; weekly: Record<string, string[]>; closed: string[] };
export const DEFAULT_CONFIG: CounselConfig = { on: true, days: 14, leadHours: 3, weekly: { "1": ["19:00", "20:00"], "2": ["19:00", "20:00"], "3": ["19:00", "20:00"], "4": ["19:00", "20:00"], "5": ["19:00", "20:00"] }, closed: [] };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 관리자 입력을 정리한다(잘못된 값은 버림). */
export function cleanConfig(raw: unknown): CounselConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const weekly: Record<string, string[]> = {};
  const w = (r.weekly && typeof r.weekly === "object" ? r.weekly : {}) as Record<string, unknown>;
  for (let d = 0; d < 7; d++) {
    const list = Array.isArray(w[String(d)]) ? (w[String(d)] as unknown[]) : [];
    const times = [...new Set(list.map((v) => String(v).trim()).filter((v) => HHMM.test(v)))].sort().slice(0, 24);
    if (times.length) weekly[String(d)] = times;
  }
  const closed = Array.isArray(r.closed) ? [...new Set((r.closed as unknown[]).map((v) => String(v).trim()).filter((v) => YMD.test(v)))].slice(0, 60) : [];
  const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  return { on: r.on !== false, days: num(r.days, 1, 60, 14), leadHours: num(r.leadHours, 0, 72, 3), weekly, closed };
}

/** 앞으로 열린 상담 시각(ms) 목록. KST 기준. 한 시각에 여러 명 예약할 수 있다. */
export function openSlots(c: CounselConfig, now = Date.now()): number[] {
  if (!c.on) return [];
  const KST = 9 * 3600_000;
  const out: number[] = [];
  const today = new Date(now + KST);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d0 = today.getUTCDate();
  for (let i = 0; i <= c.days; i++) {
    const day = new Date(Date.UTC(y, m, d0 + i));
    const ymd = day.toISOString().slice(0, 10);
    if (c.closed.includes(ymd)) continue;
    for (const hm of c.weekly[String(day.getUTCDay())] ?? []) {
      const [hh, mm] = hm.split(":").map(Number);
      const at = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm) - KST;
      if (at < now + c.leadHours * 3600_000) continue;
      out.push(at);
    }
  }
  return out;
}

/** "10월 27일 (월) 19:00" */
export function slotLabel(ms: number): string {
  const d = new Date(ms + 9 * 3600_000);
  const wd = "일월화수목금토"[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${wd}) ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export type CounselStatus = "pending" | "confirmed" | "done" | "canceled";
export const STATUS_LABEL: Record<CounselStatus, string> = { pending: "접수됨", confirmed: "확정", done: "완료", canceled: "취소" };
