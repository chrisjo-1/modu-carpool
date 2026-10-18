/** 도움말 종류와 항목 타입. 클라이언트와 서버가 함께 쓴다(DB 접근 코드 없음). */
export const HELP_SECTIONS = ["tutorial", "faq", "feedback"] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number];
export const HELP_SECTION_LABEL: Record<HelpSection, string> = { tutorial: "처음 쓰는 순서", faq: "자주 묻는 질문", feedback: "의견 보내기 안내" };
/** 자주 묻는 질문의 소분류: app(앱 사용) · law(카풀 규제) */
export const HELP_TOPICS = ["app", "law"] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];
export const HELP_TOPIC_LABEL: Record<HelpTopic, string> = { app: "앱 사용", law: "카풀 규제" };
export type HelpItem = { id: number; section: HelpSection; topic: HelpTopic; title: string; body: string; image: string; sort: number; active: boolean };
