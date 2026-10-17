// 착석 기록 저장·조회 왕복 테스트(테스트 DB). 먼저 tsc로 lib/seatCarDb.ts 등을 .sim-build3에 컴파일한다.
const D = require("../.sim-build3/seatDb.js");
const CD = require("../.sim-build3/seatCarDb.js");
const C = require("../.sim-build3/seatCar.js");
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.SEAT_DATABASE_URL);

(async () => {
  await D.ensureSeatSchema();
  await sql`delete from seat_feedback where station = 'sim-역'`;
  const key = { line: "2", station: "sim-역", dir: "up", dow: "1", slot: "07:30" };
  for (let i = 0; i < 32; i++) {
    await CD.insertFeedback(key, i % 2 ? "4" : "7", i % 3 ? "2" : "5", i % 4 !== 0);
  }
  const rows = await CD.loadFeedback(key);
  const r = C.rankEntrances(rows);
  const other = await CD.loadFeedback({ ...key, dow: "5" });
  const ok1 = rows.length === 32;
  const ok2 = r.status === "ready" && r.ranked.length > 0;
  const ok3 = other.length === 0;
  console.log(ok1 ? "PASS" : "FAIL", "저장 32건 조회");
  console.log(ok2 ? "PASS" : "FAIL", "30건 이상이면 추천 계산");
  console.log(ok3 ? "PASS" : "FAIL", "다른 요일은 섞이지 않음");
  console.log("top:", JSON.stringify(r.ranked[0]));
  await sql`delete from seat_feedback where station = 'sim-역'`;
  process.exit(ok1 && ok2 && ok3 ? 0 : 1);
})().catch((e) => { console.error("ERROR", e); process.exit(2); });
