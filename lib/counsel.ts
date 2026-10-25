/**
 * 마음 상담: 유형·질문·점수 계산과 상담 가능 시간 계산(화면·서버 공용, 서버 전용 모듈을 쓰지 않는다).
 * 안내 문구: 정성스럽게 상담해 드리고, 상담 내용은 기록으로 남기지 않는다(CARE_TEXT).
 * 문항은 공개 표준 척도(PHQ-9 우울, GAD-7 불안, PHQ-4 간이)를 쉬운 말로 옮겼다. 결과는 진단이 아니다.
 */

export const CARE_TEXT = "정성스럽게 상담해 드리고, 상담 내용은 기록으로 남기지 않아요.";

export type Topic ="work" | "mood" | "anxiety" | "relation" | "other";
export type Scale = "phq9" | "gad7" | "phq4";
export type Level = "good" | "mild" | "moderate" | "high";

export const TOPICS: { id: Topic; label: string; desc: string }[] = [
  { id: "work", label: "스트레스", desc: "일, 생활, 사람 때문에 지친 마음" },
  { id: "mood", label: "우울·무기력", desc: "기운이 없고 즐거움이 줄었어요" },
  { id: "anxiety", label: "불안·걱정", desc: "걱정이 멈추지 않아요" },
  { id: "relation", label: "관계·가족", desc: "가족, 연인, 동료와의 관계" },
  { id: "other", label: "기타", desc: "어디서부터 말해야 할지 모르겠어요" },
];

export const TOPIC_LABEL: Record<Topic, string> = Object.fromEntries(TOPICS.map((t) => [t.id, t.label])) as Record<Topic, string>;

/** 지난 2주 동안 얼마나 자주 */
export const CHOICES = ["전혀 없었어요", "며칠 있었어요", "일주일 넘게 있었어요", "거의 매일 있었어요"];

const PHQ = [
  "하는 일에 흥미나 즐거움이 거의 없었다",
  "기분이 가라앉거나, 우울하거나, 희망이 없다고 느꼈다",
  "잠들기 어렵거나 자주 깼다, 혹은 너무 많이 잤다",
  "피곤하고 기운이 없었다",
  "입맛이 없거나, 반대로 너무 많이 먹었다",
  "내가 잘못했다거나 실패했다는 생각, 나 자신이나 가족을 실망시켰다는 생각이 들었다",
  "책을 읽거나 영상을 보는 것 같은 일에 집중하기 어려웠다",
  "남이 알아챌 만큼 말이나 행동이 느려졌다, 혹은 안절부절못해 가만히 있기 힘들었다",
];
const GAD = [
  "초조하거나 불안하거나 조마조마했다",
  "걱정을 멈추거나 조절하기 어려웠다",
  "여러 가지 일을 지나치게 걱정했다",
  "편하게 쉬기 어려웠다",
  "너무 안절부절못해서 가만히 있기 힘들었다",
  "쉽게 짜증이 나거나 화가 났다",
  "끔찍한 일이 생길 것처럼 두려웠다",
];
/** 위기 문항. 모든 유형에서 마지막에 묻는다(점수와 별도로 1 이상이면 위기 안내). PHQ-9에서는 9번 문항으로 점수에도 들어간다. */
export const CRISIS_Q = "차라리 죽는 것이 낫겠다거나, 스스로를 해치고 싶은 생각이 들었다";

export const scaleOf = (t: Topic): Scale => (t === "mood" ? "phq9" : t === "anxiety" ? "gad7" : "phq4");

/** 유형별 질문(마지막은 항상 위기 문항) */
export function questionsFor(t: Topic): string[] {
  const s = scaleOf(t);
  const base = s === "phq9" ? PHQ : s === "gad7" ? GAD : [PHQ[0], PHQ[1], GAD[0], GAD[1]];
  return [...base, CRISIS_Q];
}

const CUTS: Record<Scale, [number, number, number]> = { phq9: [5, 10, 15], gad7: [5, 10, 15], phq4: [3, 6, 9] };
const MAX: Record<Scale, number> = { phq9: 27, gad7: 21, phq4: 12 };

export const LEVEL_LABEL: Record<Level, string> = { good: "양호", mild: "가벼운 주의", moderate: "주의", high: "관심 필요" };
export const LEVEL_TEXT: Record<Level, string> = {
  good: "요즘 마음 상태는 비교적 안정적이에요. 그래도 이야기하고 싶은 일이 있다면 편하게 예약해 주세요.",
  mild: "조금 지쳐 있는 것 같아요. 혼자 버티기보다 한 번 털어놓으면 한결 가벼워질 수 있어요.",
  moderate: "마음이 꽤 힘든 상태로 보여요. 상담으로 이야기를 나눠 보시길 권해요.",
  high: "많이 힘드신 것 같아요. 꼭 상담을 받아 보시고, 필요하면 전문 기관의 도움도 함께 받아 주세요.",
};

export type Result = { scale: Scale; score: number; max: number; index: number; level: Level; crisis: boolean };

/** 답(0~3)으로 점수를 낸다. 답 개수가 맞지 않으면 null. index는 0~100(높을수록 마음이 건강). */
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
  return { scale, score, max, index: Math.round(100 - (score / max) * 100), level, crisis: crisisAnswer > 0 };
}

export type Method = "email" | "phone" | "kakao" | "video";
export const METHODS: [Method, string][] = [["email", "메일로 연락"], ["phone", "전화"], ["kakao", "카카오톡"], ["video", "화상"]];
export const METHOD_LABEL: Record<Method, string> = Object.fromEntries(METHODS) as Record<Method, string>;

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

/** 위기 시 바로 연락할 곳 */
export const CRISIS_LINES: [string, string][] = [
  ["자살예방 상담전화", "109"],
  ["정신건강 위기상담", "1577-0199"],
  ["긴급 상황", "119"],
];
