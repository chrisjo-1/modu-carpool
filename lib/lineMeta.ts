/** 노선 이름과 고유색(역 목록 없이 가벼운 파일). lib/subway.ts가 다시 내보낸다. */
export type LineId = string;

export const ALL_LINES: { id: LineId; name: string }[] = [
  { id: "1", name: "1호선" },
  { id: "2", name: "2호선" },
  { id: "3", name: "3호선" },
  { id: "4", name: "4호선" },
  { id: "5", name: "5호선" },
  { id: "6", name: "6호선" },
  { id: "7", name: "7호선" },
  { id: "8", name: "8호선" },
  { id: "9", name: "9호선" },
  { id: "gyeongui", name: "경의중앙선" },
  { id: "suin", name: "수인분당선" },
  { id: "sinbundang", name: "신분당선" },
  { id: "airport", name: "공항철도" },
  { id: "gyeongchun", name: "경춘선" },
  { id: "ui", name: "우이신설선" },
  { id: "sillim", name: "신림선" },
  { id: "incheon1", name: "인천1호선" },
  { id: "incheon2", name: "인천2호선" },
];

/** 노선 고유색(수도권 전철 공식 색). text는 배경 위 글자색(밝은 색 노선은 짙은 글자). */
export const LINE_COLORS: Record<LineId, { bg: string; text: string }> = {
  "1": { bg: "#0052A4", text: "#FFFFFF" },
  "2": { bg: "#00A84D", text: "#FFFFFF" },
  "3": { bg: "#EF7C1C", text: "#FFFFFF" },
  "4": { bg: "#00A5DE", text: "#FFFFFF" },
  "5": { bg: "#996CAC", text: "#FFFFFF" },
  "6": { bg: "#CD7C2F", text: "#FFFFFF" },
  "7": { bg: "#747F00", text: "#FFFFFF" },
  "8": { bg: "#E6186C", text: "#FFFFFF" },
  "9": { bg: "#BDB092", text: "#3B3320" },
  gyeongui: { bg: "#77C4A3", text: "#123B2B" },
  suin: { bg: "#F5A200", text: "#3B2A00" },
  sinbundang: { bg: "#D4003B", text: "#FFFFFF" },
  airport: { bg: "#0090D2", text: "#FFFFFF" },
  gyeongchun: { bg: "#0C8E72", text: "#FFFFFF" },
  ui: { bg: "#B0CE18", text: "#2E3A00" },
  sillim: { bg: "#6789CA", text: "#FFFFFF" },
  incheon1: { bg: "#7CA8D5", text: "#FFFFFF" },
  incheon2: { bg: "#ED8B00", text: "#FFFFFF" },
};

export const lineColor = (id: LineId) => LINE_COLORS[id] ?? { bg: "#2F6BFF", text: "#FFFFFF" };

