// 탑승 위치(칸-문)·차량 번호 비교 규칙 테스트. 먼저 tsc로 lib/subwayPosition.ts를 .sim-build4에 컴파일한다.
const P = require("../.sim-build4/subwayPosition.js");

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -> " + extra : "")); }
};

check("위치 표기 6-1", P.positionLabel("6", "1") === "6-1");
check("문이 없으면 빈 표기", P.positionLabel("6", "") === "");
check("문 1~4만 허용", P.isDoor("1") && P.isDoor("4") && !P.isDoor("5") && !P.isDoor("0"));
check("차량 번호 4자리", P.isCarNo("2590") && !P.isCarNo("259") && !P.isCarNo("25a0"));

check("같은 번호 → 같은 칸", P.compareCarNo("2", "2590", "2590").kind === "same_car");
const tr = P.compareCarNo("2", "2590", "2490");
check("2호선 같은 편성 → 같은 열차, 1칸 차이", tr.kind === "same_train" && tr.gap === 1, JSON.stringify(tr));
check("2호선 다른 편성 → 다른 열차", P.compareCarNo("2", "2590", "2589").kind === "different");
check("다른 노선은 편성 추정 안 함", P.compareCarNo("5", "5590", "5490").kind === "different");
check("다른 노선도 같은 번호면 같은 칸", P.compareCarNo("5", "5590", "5590").kind === "same_car");

check("2590 → 6번째 칸", P.carPositionFromNo("2", "2590") === 6);
check("2090 → 1번째 칸", P.carPositionFromNo("2", "2090") === 1);
check("다른 노선은 0", P.carPositionFromNo("5", "5590") === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
