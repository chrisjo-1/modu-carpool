// 앉아가기 흐름 시뮬레이션(DB 없이 규칙만). 실행 전 컴파일:
//   npx tsc lib/seatMatch.ts lib/subwayRoute.ts lib/subway.ts lib/subwayPosition.ts lib/seatCar.ts --outDir .sim-build7 --module commonjs --target es2019 --moduleResolution node --skipLibCheck --esModuleInterop
//   node scripts/seat-flow-sim.cjs
// 흐름: ① 기본 정보로 추천 칸 → ② 앉았어요 → ③ 같은 방향 가능자 전체에 푸시 → ④ 수락 → 메모창 여부 → ⑤ 크레딧(하루 1회, DB 규칙이라 여기서는 제외) → ⑥ 전체 흐름 한 번에.
const M = require("../.sim-build7/seatMatch.js");
const C = require("../.sim-build7/seatCar.js");
const P = require("../.sim-build7/subwayPosition.js");

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -> " + extra : "")); }
};
const base = { days: "12345", back: false, timeBack: "", backCar: "", backGate: "", boardGate: "1", boardCar: "6" };
const plan = (id, user, line, from, to, time) => ({ ...base, id, userId: user, boardLine: line, alightLine: line, boardStation: from, alightStation: to, timeGo: time });

// ① 기본 정보만으로 추천 칸 3개(기록 없음 → 혼잡도·칸 위치 추정)
const est = C.estimateCars(8, 55, []);
const topCars = [...est.cars].sort((a, b) => b.prob - a.prob);
check("① 기록 없이도 추정 칸 3개가 나온다", est.cars.length === 3 && est.basis === "congestion", JSON.stringify(est).slice(0, 120));
check("① 추천 3칸은 칸 수 안 번호", topCars.every((r) => Number(r.car) >= 1 && Number(r.car) <= 8));

// ② 앉았어요 → ③ 같은 방향에서 내가 탄 뒤 타는 분 전체에게
const me = plan(1, "me", "5", "장한평", "마포", "08:00");
const after1 = plan(2, "a1", "5", "답십리", "여의도", "08:03"); // 같은 방향, 나보다 뒤 승차, 더 멀리 감
const after2 = plan(3, "a2", "5", "왕십리", "여의도", "08:05"); // 같은 방향, 나보다 뒤 승차, 더 멀리 감
const before = plan(4, "b1", "5", "군자", "마포", "07:50"); // 나보다 먼저 탐 → 대상 아님
const other = plan(5, "c1", "2", "신도림", "합정", "08:02"); // 다른 노선 → 대상 아님
const opposite = plan(6, "d1", "5", "마포", "장한평", "08:01"); // 반대 방향 → 대상 아님
const ahead = M.rankAhead(me, [after1, after2, before, other, opposite]);
const ids = ahead.map((c) => c.userId).sort();
check("③ 같은 방향 뒤 승차자는 대상에 든다(a1, a2 포함)", ids.includes("a1") && ids.includes("a2"), JSON.stringify(ids));
check("③ 먼저 탄 분·다른 노선·반대 방향은 제외", !ids.includes("b1") && !ids.includes("c1") && !ids.includes("d1"), JSON.stringify(ids));
check("③ 대상은 모두 '내 자리를 받을 쪽'(role give)", ahead.every((c) => c.role === "give"));

// ④ 수락 후 메모창 판단
check("④ 자리·메모 전부 없으면 메모창", P.needsMemoPopup(null) === true);
check("④ 칸만 있고 메모가 없으면 메모창", P.needsMemoPopup({ car: "5", memo: "" }) === true);
check("④ 메모만 있고 칸이 없으면 메모창", P.needsMemoPopup({ car: "", memo: "검정 패딩" }) === true);
check("④ 칸과 메모가 있으면 메모창 없음", P.needsMemoPopup({ car: "5", memo: "검정 패딩" }) === false);
check("④ 메모가 공백뿐이면 메모창", P.needsMemoPopup({ car: "5", memo: "   " }) === true);

// ⑥ 전체 흐름: 추천 칸 → 앉았어요 → 대상 → 수락 → 메모 입력 후 팝업 없음
const pick = topCars[0].car;
const sentTo = ahead.map((c) => c.userId);
check("⑥ 추천 1위 칸으로 앉은 뒤 푸시 대상이 생긴다", sentTo.length >= 1 && typeof pick === "string");
const afterSave = { car: pick, memo: "네이비 패딩" };
check("⑥ 저장 뒤에는 메모창이 뜨지 않는다", P.needsMemoPopup(afterSave) === false);


// ⑦ 방향 기준: 같은 사람의 반대 방향 보기(back)도 똑같이 매칭된다
const both = (id, user, from, to, tGo, tBack) => ({ ...plan(id, user, "5", from, to, tGo), back: true, timeBack: tBack, backCar: "", backGate: "", backNext: "" });
const meB = M.tripView(both(10, "me2", "장한평", "마포", "08:00", "18:00"), "back");
check("⑦ 반대 방향 보기는 출발·도착이 바뀐다", meB && meB.boardStation === "마포" && meB.alightStation === "장한평" && meB.timeGo === "18:00", JSON.stringify(meB && [meB.boardStation, meB.alightStation, meB.timeGo]));
const aB = M.tripView(both(11, "x1", "답십리", "여의도", "08:10", "18:03"), "back"); // 여의도→답십리 방향
const sameDir = M.tripView(both(12, "x2", "군자", "공덕", "08:20", "18:05"), "back"); // 공덕→군자 (마포 뒤에 탐, 더 멀리, 같은 방향)
const r = M.rankAhead(meB, [aB, sameDir].filter(Boolean));
check("⑦ 반대 방향도 같은 방향 뒤 승차자가 대상이 된다", r.some((c) => c.userId === "x2"), JSON.stringify(r.map((c) => c.userId)));
check("⑦ 퇴근 정보 없으면 반대 방향 보기가 없다", M.tripView(plan(13, "n1", "5", "장한평", "마포", "08:00"), "back") === null);
check("⑦ 두 방향 보기는 최대 2개", M.tripViews(both(14, "t1", "장한평", "마포", "08:00", "18:00")).length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
console.log("참고: 크레딧 하루 1회·푸시 발송·DB 저장은 DB 연결이 필요해 이 스크립트에서 빠져 있다(스테이징에서 따로 확인).");
process.exit(fail ? 1 : 0);
