// 혼잡도 조회·칸 수 규칙 테스트. 먼저 tsc로 lib/congestion.ts, lib/seatCar.ts, lib/subway.ts를 .sim-build4에 컴파일한다.
const C = require("../.sim-build4/congestion.js");
const S = require("../.sim-build4/seatCar.js");
const B = require("../.sim-build4/subway.js");

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -> " + extra : "")); }
};

// 1) 시간대 열 찾기
check("05:30 → 0번 열", C.slotIndex("05:30") === 0);
check("24:30 → 38번 열(마지막)", C.slotIndex("24:30") === 38);
check("05:00은 자료 밖(-1)", C.slotIndex("05:00") === -1);
check("25:00은 자료 밖(-1)", C.slotIndex("25:00") === -1);
check("05:45는 30분 단위가 아님(-1)", C.slotIndex("05:45") === -1);

// 2) 값 조회 (자료 원본: 1호선 서울역 상선 05:30 평일 8.78, 일요일 4.77, 토요일 11.63)
const wk = C.lookupCongestion("1", "서울역", "up", "1", "05:30");
check("서울역 평일 05:30 = 9%", wk && wk.pct === 9, JSON.stringify(wk));
check("서울역 일요일(0) 05:30 = 5%", (C.lookupCongestion("1", "서울역", "up", "0", "05:30") || {}).pct === 5);
check("서울역 토요일(6) 05:30 = 12%", (C.lookupCongestion("1", "서울역", "up", "6", "05:30") || {}).pct === 12);
check("정보 없는 역은 null", C.lookupCongestion("1", "없는역", "up", "1", "08:00") === null);
check("정보 없는 노선(9호선)은 null", C.lookupCongestion("9", "개화", "up", "1", "08:00") === null);
check("잘못된 시간대는 null", C.lookupCongestion("1", "서울역", "up", "1", "04:00") === null);

// 3) 이름이 다른 역(별칭)
check("2호선 신촌은 신촌(지하) 값을 쓴다", C.lookupCongestion("2", "신촌", "up", "1", "08:00") !== null);

// 4) 단계 경계
check("29% → 여유", C.levelOf(29) === "low");
check("30% → 보통", C.levelOf(30) === "mid");
check("60% → 혼잡", C.levelOf(60) === "high");
check("100% → 매우 혼잡", C.levelOf(100) === "over");

// 5) 노선별 칸 수
check("1호선 10칸", B.carCountOf("1") === 10);
check("5호선 8칸", B.carCountOf("5") === 8);
check("7호선 8칸", B.carCountOf("7") === 8);
check("8호선 6칸", B.carCountOf("8") === 6);
check("8호선 목록은 1~6", B.carNumbersOf("8").join(",") === "1,2,3,4,5,6");

// 6) 착석 기록 검사도 노선 칸 수를 따른다
const base = { line: "8", station: "모란", dir: "up", dow: "1", slot: "08:00", entrance: "2", seated: true };
check("8호선 6호차는 저장 가능", S.parseFeedback({ ...base, car: "6" }).ok === true);
check("8호선 7호차는 거부", S.parseFeedback({ ...base, car: "7" }).ok === false);
check("2호선 10호차는 저장 가능", S.parseFeedback({ ...base, line: "2", car: "10" }).ok === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
