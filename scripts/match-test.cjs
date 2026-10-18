// 노선 방향·자리 매칭 규칙 테스트. 먼저 tsc로 lib/subwayRoute.ts, lib/seatMatch.ts를 .sim-build5에 컴파일한다.
const R = require("../.sim-build5/subwayRoute.js");
const M = require("../.sim-build5/seatMatch.js");

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -> " + extra : "")); }
};

// 1) 경로와 방향
const p = R.routePath("5", "장한평", "마포");
check("5호선 장한평→마포 경로 첫 역은 답십리", p && p[1] === "답십리", JSON.stringify(p));
const h = R.headingFor("5", "장한평", "마포");
check("장한평→마포: 방화 방면, 다음역 답십리, 상행", h && h.next === "답십리" && h.terminal === "방화" && h.dir === "up", JSON.stringify(h));
const h2 = R.headingFor("5", "군자", "천호");
check("군자→천호: 하행, 종착역은 하남검단산·마천", h2 && h2.dir === "down" && h2.terminal === "하남검단산·마천", JSON.stringify(h2));
check("마천 갈래 경로: 천호→오금", (R.routePath("5", "천호", "오금") || []).join(",") === "천호,강동,둔촌동,올림픽공원(한국체대),방이,오금");
const heads = R.headingsAt("5", "강동");
check("강동에서는 세 방향(천호·길동·둔촌동)", heads.length === 3, JSON.stringify(heads));
const h3 = R.headingFor("2", "강남", "역삼");
check("2호선 본선은 종착역 없이 다음역 안내", h3 && h3.next === "역삼" && h3.terminal === null, JSON.stringify(h3));
const h4 = R.headingFor("2", "신도림", "까치산");
check("2호선 신정지선: 다음역 도림천, 종착 까치산", h4 && h4.next === "도림천" && h4.terminal === "까치산", JSON.stringify(h4));
const loopPath = R.routePath("2", "충정로", "을지로입구");
check("2호선 순환: 충정로→시청→을지로입구", (loopPath || []).join(",") === "충정로,시청,을지로입구", JSON.stringify(loopPath));
check("정의 없는 노선(9호선)은 null", R.routePath("9", "a", "b") === null && R.headingsAt("9", "a").length === 0);

// 1-2) 1·3·4·6·7·8호선(서울교통공사 구간)
check("1호선 동대문→신설동 사이에 동묘앞", (R.routePath("1", "동대문", "신설동") || []).join(",") === "동대문,동묘앞,신설동");
check("8호선 복정→산성 사이에 남위례", (R.routePath("8", "복정", "산성") || []).join(",") === "복정,남위례,산성");
const h8 = R.headingFor("8", "잠실", "모란");
check("8호선 잠실→모란: 모란 방면, 다음역 석촌", h8 && h8.next === "석촌" && h8.terminal === "모란", JSON.stringify(h8));
const l3 = R.headingFor("3", "교대", "고속터미널");
check("3호선 교대→고속터미널: 지축 방면", l3 && l3.terminal === "지축" && l3.dir === "up", JSON.stringify(l3));
const h6 = R.headingFor("6", "새절", "신내");
check("6호선 새절→신내: 신내 방면", h6 && h6.terminal === "신내" && h6.next === "증산", JSON.stringify(h6));
check("6호선 응암에서는 세 방향(역촌·구산·새절)", R.headingsAt("6", "응암").length === 3, JSON.stringify(R.headingsAt("6", "응암")));
check("7호선 장암→온수 경로 길이 42", (R.routePath("7", "장암", "온수") || []).length === 42);
check("4호선 정의됨", R.hasRoute("4") && !R.hasRoute("9"));

// 2) 자리 매칭
const base = { days: "12345", back: false, timeBack: "", backCar: "", backGate: "", boardGate: "1" };
const plan = (id, user, line, from, to, time, car = "6") => ({ ...base, id, userId: user, boardLine: line, alightLine: line, boardStation: from, alightStation: to, timeGo: time, boardCar: car });

const taker = plan(1, "u1", "5", "장한평", "마포", "08:00");
const giver1 = plan(2, "u2", "5", "군자", "답십리", "07:56", "6"); // 군자→장한평(2분)→답십리: 1정거장
const pair = M.seatPair(taker, giver1);
check("장한평 탑승자 ↔ 답십리 하차자 = 1정거장", pair && pair.stops === 1 && pair.seatStation === "답십리" && pair.meetStation === "장한평", JSON.stringify(pair));
check("만날 위치는 주는 사람의 칸", pair && pair.car === "6" && pair.gate === "1");
check("예상 시각 차이 2분(07:56 + 2분 = 07:58, 탑승 08:00)", pair && pair.gapMin === 2, JSON.stringify(pair));

const giver3 = plan(3, "u3", "5", "아차산", "왕십리", "07:54"); // 아차산→군자→장한평(4분)→답십리→마장→왕십리: 3정거장
check("3정거장 뒤 하차자도 매칭", (M.seatPair(taker, giver3) || {}).stops === 3);
const giver4 = plan(4, "u4", "5", "아차산", "행당", "07:54"); // 4정거장
check("4정거장은 제외", M.seatPair(taker, giver4) === null);
const giver5 = plan(5, "u5", "5", "장한평", "답십리", "08:00");
check("같은 역에서 타는 사람은 자리를 줄 수 없음", M.seatPair(taker, giver5) === null);
const giver6 = plan(6, "u6", "5", "답십리", "장한평", "07:58");
check("반대 방향은 제외", M.seatPair(taker, giver6) === null);
const giver7 = plan(7, "u7", "5", "군자", "답십리", "07:30");
check("시각 차이 10분 넘으면 제외", M.seatPair(taker, giver7) === null);
const giver8 = plan(8, "u8", "5", "군자", "마포", "07:56");
check("받는 사람보다 멀리 가는 사람은 제외", M.seatPair(taker, giver8) === null);
const giver9 = { ...plan(9, "u9", "5", "군자", "답십리", "07:56"), days: "06" };
check("요일이 안 겹치면 제외", M.seatPair(taker, giver9) === null);

const ranked = M.rankCandidates(taker, [giver3, giver1, giver4, giver5]);
check("순위: 1정거장이 먼저", ranked.length === 2 && ranked[0].id === 2 && ranked[1].id === 3, JSON.stringify(ranked.map((c) => [c.id, c.stops, c.role])));
check("내가 받는 쪽이면 role=take", ranked[0].role === "take");
const asGiver = M.rankCandidates(giver1, [taker]);
check("주는 사람 입장에서는 role=give", asGiver.length === 1 && asGiver[0].role === "give" && asGiver[0].meetStation === "장한평");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
