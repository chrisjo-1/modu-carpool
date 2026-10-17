// 앉아가기 시뮬레이션(테스트 ID sim-u1 …). 실제 DB 함수를 그대로 호출한다.
// 실행 순서:
//   npx tsc lib/seatDb.ts lib/seatMatch.ts lib/subway.ts --outDir .sim-build --module commonjs --target es2020 --moduleResolution node --skipLibCheck --esModuleInterop
//   SEAT_DATABASE_URL=<테스트 브랜치 연결 문자열> node scripts/seat-sim.cjs
// 주의: 운영 modu-seat 연결 문자열을 쓰지 말고 테스트 브랜치를 쓴다. 실행 전 sim- 테스트 데이터를 지운다.
// 앉아가기 시뮬레이션: 테스트 ID(sim-u1 …)로 등록 → 매칭 → 요청 → 수락/거절 → 해제 흐름을 실제 DB 함수로 돌린다.
const path = require("path");
const base = path.join(__dirname, "..", ".sim-build") + path.sep;
const S = require(base + "seatDb.js");
const { neon } = require(path.join(__dirname, "..", "node_modules", "@neondatabase", "serverless"));
const sql = neon(process.env.SEAT_DATABASE_URL);

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log("PASS  " + name);
  } else {
    fail++;
    console.log("FAIL  " + name + (extra ? "  -> " + extra : ""));
  }
};

const P = (o) => ({
  boardLine: "2", board: "잠실", alightLine: "2", alight: "강남",
  timeGo: "07:30", car: "4", gate: "3",
  back: false, timeBack: "18:30", carBack: "", gateBack: "",
  ...o,
});

(async () => {
  await S.ensureSeatSchema();
  await sql`delete from seat_requests`;
  await sql`delete from seat_plans`;

  // 1) 등록 (테스트 ID 7명)
  const seed = [
    ["sim-u1", "12345", P({})],                               // 나
    ["sim-u2", "12345", P({ timeGo: "07:40", car: "4" })],    // 같은 칸, 10분 차 → 매칭
    ["sim-u3", "12345", P({ timeGo: "07:55", car: "7" })],    // 다른 칸, 25분 차 → 매칭
    ["sim-u4", "12345", P({ timeGo: "08:10", car: "4" })],    // 40분 차 → 제외
    ["sim-u5", "67", P({})],                                  // 요일 안 겹침 → 제외
    ["sim-u6", "12345", P({ alight: "교대" })],               // 하차역 다름 → 제외
    ["sim-u7", "12345", P({ boardLine: "5", board: "여의도", alightLine: "5", alight: "광화문" })], // 다른 노선 → 제외
  ];
  for (const [id, days, p] of seed) await S.upsertPlan(id, days, p);

  const me = await S.getMyPlan("sim-u1");
  check("등록 저장", !!me && me.timeGo === "07:30" && me.boardCar === "4");

  // 2) 후보 매칭 규칙
  const cands = await S.listCandidates(me);
  const ids = cands.map((c) => c.userId);
  check("후보는 u2, u3만", JSON.stringify(ids) === JSON.stringify(["sim-u2", "sim-u3"]), JSON.stringify(ids));
  check("같은 칸(u2)이 먼저 나옴", ids[0] === "sim-u2");
  check("40분 차(u4) 제외", !ids.includes("sim-u4"));
  check("요일 안 겹침(u5) 제외", !ids.includes("sim-u5"));
  check("하차역 다름(u6) 제외", !ids.includes("sim-u6"));
  check("다른 노선(u7) 제외", !ids.includes("sim-u7"));
  check("나 자신은 제외", !ids.includes("sim-u1"));

  // 3) 재저장은 중복 없이 갱신
  await S.upsertPlan("sim-u1", "12345", P({ timeGo: "07:35", car: "4" }));
  const cnt = await sql`select count(*)::int as n from seat_plans where user_id = 'sim-u1' and status = 'active'`;
  check("재저장은 한 건만 유지", cnt[0].n === 1, "count=" + cnt[0].n);
  check("재저장 시각 반영", (await S.getMyPlan("sim-u1")).timeGo === "07:35");

  // 4) 요청 → 수락
  const p2 = await S.getMyPlan("sim-u2");
  const p4 = await S.getMyPlan("sim-u4");
  const p1 = await S.getMyPlan("sim-u1");
  const r1 = await S.createRequest("sim-u1", p2.id);
  check("후보에게 요청 성공", r1.ok === true, JSON.stringify(r1));
  check("같은 요청 중복 차단", (await S.createRequest("sim-u1", p2.id)).ok === false);
  check("규칙 밖(u4) 요청 차단", (await S.createRequest("sim-u1", p4.id)).ok === false);
  check("내 등록에 요청 차단", (await S.createRequest("sim-u1", p1.id)).ok === false);
  check("다른 사람은 수락 못함", (await S.respondRequest(r1.id, "sim-u3", true)).ok === false);
  const acc = await S.respondRequest(r1.id, "sim-u2", true);
  check("받은 사람이 수락", acc.ok === true && acc.status === "accepted", JSON.stringify(acc));
  check("처리된 요청 재처리 차단", (await S.respondRequest(r1.id, "sim-u2", false)).ok === false);
  const inc = await S.listRequests("sim-u2");
  check("받은 목록에 수락 표시", inc.incoming.length === 1 && inc.incoming[0].status === "accepted");
  const out = await S.listRequests("sim-u1");
  check("보낸 목록에 수락 표시", out.outgoing.length === 1 && out.outgoing[0].status === "accepted");

  // 5) 요청 → 거절
  const r5 = await S.createRequest("sim-u3", p1.id);
  check("u3 → u1 요청(25분 차) 성공", r5.ok === true, JSON.stringify(r5));
  const dec = await S.respondRequest(r5.id, "sim-u1", false);
  check("거절 처리", dec.ok === true && dec.status === "declined");

  // 6) 해제: u3를 닫으면 u1 후보에서 빠진다
  await S.closePlan("sim-u3");
  check("해제한 등록은 조회 안 됨", (await S.getMyPlan("sim-u3")) === null);
  const after = await S.listCandidates(await S.getMyPlan("sim-u1"));
  check("해제한 u3는 후보에서 빠짐", !after.some((c) => c.userId === "sim-u3"), JSON.stringify(after.map((c) => c.userId)));
  check("해제한 뒤 요청 불가", (await S.createRequest("sim-u1", (await sql`select id from seat_plans where user_id='sim-u3'`)[0].id)).ok === false);

  console.log(`\n결과: 통과 ${pass}, 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("ERROR", e);
  process.exit(2);
});
