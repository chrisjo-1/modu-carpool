// 탑승 칸·입구 안내 규칙 테스트. 먼저 tsc로 lib/seatCar.ts, lib/subway.ts를 .sim-build2에 컴파일한다.
const C = require("../.sim-build2/seatCar.js");

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -> " + extra : "")); }
};

const rows = (car, entrance, seated, n) => Array.from({ length: n }, (_, i) => ({ car, entrance, seated: i < seated }));

// 1) 시간대 줄이기
check("07:45 → 07:30", C.slotOf("07:45") === "07:30");
check("07:10 → 07:00", C.slotOf("07:10") === "07:00");
check("잘못된 시각은 빈 값", C.slotOf("25:00") === "" && C.slotOf("abc") === "");

// 2) 기준 미달이면 추천하지 않음
const few = C.rankEntrances(rows("3", "2", 10, 29));
check("29건이면 데이터 수집 중", few.status === "collecting" && few.ranked.length === 0 && few.total === 29);

// 3) 30건 이상이면 순위 계산
const data = [...rows("3", "2", 9, 10), ...rows("5", "4", 3, 10), ...rows("7", "1", 1, 12), ...rows("8", "6", 0, 3)];
const r = C.rankEntrances(data);
check("30건 이상이면 ready", r.status === "ready" && r.total === 35, JSON.stringify(r.status));
check("최고 순위는 3호차 입구 2", r.ranked[0] && r.ranked[0].car === "3" && r.ranked[0].entrance === "2", JSON.stringify(r.ranked[0]));
check("5건 미만 조합(8호차 6번)은 빠짐", !r.ranked.some((x) => x.car === "8"));
check("순위는 최대 3개", r.ranked.length <= 3);

// 4) 평활: 2/2 기록이 100%로 나오지 않음
const tiny = [...rows("2", "1", 5, 5), ...rows("9", "9", 0, 30)];
const t2 = C.rankEntrances(tiny);
const top = t2.ranked[0];
check("5/5 조합도 0.9 아래로 평활", top && top.rate < 0.9 && top.rate > 0.5, JSON.stringify(top));

// 5) 수준 구분
check("0.6 이상은 높음", C.levelOf(0.6) === "high");
check("0.4~0.6 미만은 보통", C.levelOf(0.4) === "mid" && C.levelOf(0.59) === "mid");
check("0.4 미만은 낮음", C.levelOf(0.39) === "low");

// 6) 입력 검사
const okKey = C.parseKey({ line: "2", station: "강남", dir: "up", dow: "1", slot: "07:30" });
check("정상 키 통과", okKey.ok === true);
check("없는 노선 거부", C.parseKey({ line: "99", station: "강남", dir: "up", dow: "1", slot: "07:30" }).ok === false);
check("방향 누락 거부", C.parseKey({ line: "2", station: "강남", dir: "", dow: "1", slot: "07:30" }).ok === false);
check("요일 7 거부", C.parseKey({ line: "2", station: "강남", dir: "up", dow: "7", slot: "07:30" }).ok === false);
check("시간대 07:15 거부", C.parseKey({ line: "2", station: "강남", dir: "up", dow: "1", slot: "07:15" }).ok === false);

const fb = C.parseFeedback({ line: "2", station: "강남", dir: "up", dow: "1", slot: "07:30", car: "4", entrance: "3", seated: true });
check("정상 기록 통과", fb.ok === true);
check("칸 11 거부", C.parseFeedback({ line: "2", station: "강남", dir: "up", dow: "1", slot: "07:30", car: "11", entrance: "3", seated: true }).ok === false);
check("입구 문자 거부", C.parseFeedback({ line: "2", station: "강남", dir: "up", dow: "1", slot: "07:30", car: "4", entrance: "3a", seated: true }).ok === false);
check("앉음 여부 누락 거부", C.parseFeedback({ line: "2", station: "강남", dir: "up", dow: "1", slot: "07:30", car: "4", entrance: "3" }).ok === false);

console.log(`\n결과: 통과 ${pass}, 실패 ${fail}`);
process.exit(fail ? 1 : 0);
