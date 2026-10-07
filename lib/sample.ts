import type { Post } from "./types";

/** DB 연결 전 화면 확인용 예시 글. 날짜는 오늘 기준으로 만든다. */
export function samplePosts(): Post[] {
  const at = (days: number, h: number, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const base = { status: "open" as const, mine: false, ownerBio: "" };
  return [
    { ...base, id: "s1", owner: "민준", role: "driver", kind: "commute", cost: "meter", origin: "수원 영통역", dest: "강남역", departAt: at(1, 7, 20), seats: 3, note: "평일 매일 출근합니다. 조용히 가는 편이에요.", ownerBio: "판교·강남 출퇴근 5년차" },
    { ...base, id: "s2", owner: "Sarah", role: "rider", kind: "trip", cost: "free", origin: "Hongdae", dest: "Gyeongbokgung Palace", departAt: at(1, 10, 0), seats: 2, note: "First time in Seoul! Happy to chat in English.", ownerBio: "Visiting from Seattle" },
    { ...base, id: "s3", owner: "지우", role: "driver", kind: "commute", cost: "free", origin: "일산 대화역", dest: "여의도", departAt: at(1, 7, 40), seats: 2, note: "여의도 IFC 근처까지 갑니다." },
    { ...base, id: "s4", owner: "健太", role: "rider", kind: "trip", cost: "free", origin: "明洞", dest: "南山タワー", departAt: at(2, 17, 30), seats: 1, note: "夕方の景色を見に行きたいです。" },
    { ...base, id: "s5", owner: "서연", role: "rider", kind: "commute", cost: "meter", origin: "분당 정자역", dest: "판교 테크노밸리", departAt: at(1, 8, 10), seats: 1, note: "비용은 미터기 기준으로 나눠요." },
    { ...base, id: "s6", owner: "도윤", role: "driver", kind: "trip", cost: "free", origin: "서울역", dest: "북촌 한옥마을", departAt: at(3, 14, 0), seats: 3, note: "주말에 북촌 가는 길, 같이 가실 분." , ownerBio: "서울 토박이, 영어 조금 합니다" },
  ];
}
