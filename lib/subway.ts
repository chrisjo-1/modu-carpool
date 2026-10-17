/**
 * 지하철 앉아가기: 노선·역 목록과 이용 등록 기본값.
 * 시범 노선은 2호선과 5호선이다. 역 목록은 검수가 끝나기 전 임시 목록이다.
 */

export type LineId = "2" | "5";

export const LINES: Record<LineId, { name: string; stations: string[] }> = {
  "2": {
    name: "2호선",
    stations: [
      "시청", "을지로입구", "을지로3가", "을지로4가", "동대문역사문화공원", "신당", "상왕십리", "왕십리", "한양대", "뚝섬",
      "성수", "건대입구", "구의", "강변", "잠실나루", "잠실", "잠실새내", "종합운동장", "삼성", "선릉", "역삼", "강남",
      "교대", "서초", "방배", "사당", "낙성대", "서울대입구", "봉천", "신림", "신대방", "구로디지털단지", "대림", "신도림",
      "문래", "영등포구청", "당산", "합정", "홍대입구", "신촌", "이대", "아현", "충정로", "신설동", "용두", "신답",
    ],
  },
  "5": {
    name: "5호선",
    stations: [
      "방화", "개화산", "김포공항", "송정", "마곡", "발산", "우장산", "화곡", "까치산", "신정", "목동", "오목교", "양평",
      "영등포시장", "신길", "여의도", "여의나루", "마포", "공덕", "애오개", "충정로", "서대문", "광화문", "종로3가",
      "을지로4가", "동대문역사문화공원", "청구", "신금호", "행당", "왕십리", "마장", "답십리", "장한평", "군자", "아차산",
      "광나루", "천호", "강동", "길동", "굽은다리", "명일", "고덕", "상일동", "강일", "미사", "하남풍산", "하남시청", "하남검단산",
    ],
  },
};

export const PILOT_LINES: LineId[] = ["2", "5"];

export const CAR_NUMBERS = Array.from({ length: 10 }, (_, i) => String(i + 1));

/** 앉아가기 이용 등록 한 건. 요일은 출퇴근 정보의 요일을 함께 쓴다. */
export type SubwayPlan = {
  boardLine: LineId;
  board: string;
  alightLine: LineId;
  alight: string;
  timeGo: string;
  car: string;
  gate: string;
  /** 퇴근도 함께 등록(반대 방향 자동) */
  back: boolean;
  timeBack: string;
  carBack: string;
  gateBack: string;
};

export const EMPTY_PLAN: SubwayPlan = {
  boardLine: "2",
  board: "",
  alightLine: "2",
  alight: "",
  timeGo: "07:30",
  car: "",
  gate: "",
  back: false,
  timeBack: "18:30",
  carBack: "",
  gateBack: "",
};

/** 입력 검사: 출근 탑승역·하차역·칸이 필요하다. 퇴근을 켰으면 퇴근 시각도 필요하다. */
export function planProblem(p: SubwayPlan): string | null {
  if (!p.board) return "출근 탑승역을 골라 주세요.";
  if (!p.alight) return "출근 하차역을 골라 주세요.";
  if (p.board === p.alight && p.boardLine === p.alightLine) return "탑승역과 하차역이 같아요.";
  if (!p.car) return "출근 탑승 칸을 골라 주세요.";
  if (p.back && !p.timeBack) return "퇴근 출발 시각을 적어 주세요.";
  return null;
}
