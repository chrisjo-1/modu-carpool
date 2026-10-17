// 모든 메일에 서비스 주소·바로가기 버튼이 들어가는지 확인한다. 먼저 tsc로 lib/mail.ts, lib/campaign.ts를 .sim-build6에 컴파일한다.
const M = require("../.sim-build6/mail.js");
const C = require("../.sim-build6/campaign.js");
const SITE = require("../.sim-build6/site.js").SITE_URL;
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) { pass++; console.log("PASS  " + n); } else { fail++; console.log("FAIL  " + n + (x ? "  -> " + x : "")); } };
const count = (s, sub) => s.split(sub).length - 1;

// 1) 공지 메일: 카드 안에 버튼·주소가 한 번만
const camp = C.renderHtml("안녕하세요(구워프,풀럭)모두의카풀입니다.\n\n탈퇴·개인정보 삭제 방법: 내 정보 > 탈퇴 신청");
const c2 = M.ensureSiteLink(camp, "본문");
check("공지 메일에 바로가기 버튼", c2.html.includes("모두의카풀 바로가기"));
check("공지 메일에 서비스 주소", c2.html.includes("서비스 주소") && c2.html.includes(`href="${SITE}"`));
check("공지 메일은 중복으로 붙이지 않음", count(c2.html, "모두의카풀 바로가기") === 1);
check("텍스트 버전에도 주소", c2.text.includes(SITE));

// 2) 이미 파란 버튼이 있는 메일: 테두리 버튼으로 덧붙임
const verify = `<div><a href="${SITE}/verify?t=x" style="display:inline-block;background:#2F6BFF;color:#ffffff">이메일 인증하기</a></div>`;
const v2 = M.ensureSiteLink(verify, "인증 링크");
check("행동 버튼이 있는 메일에도 바로가기 추가", v2.html.includes("모두의카풀 바로가기"));
check("이 경우 테두리 버튼(흰 배경)", v2.html.includes("background:#ffffff;color:#2F6BFF"));

// 3) 버튼 없는 메일(정지 안내 등): 파란 버튼으로 덧붙임
const plain = M.ensureSiteLink("<div>이용이 제한되었습니다.</div>", "이용 제한");
check("버튼 없는 메일에는 파란 버튼", plain.html.includes("background:#2F6BFF;color:#ffffff") && plain.text.endsWith(SITE));

// 4) 텍스트에 이미 주소가 있으면 다시 붙이지 않음
const t2 = M.ensureSiteLink("<div></div>", `확인: ${SITE}`);
check("텍스트 주소 중복 없음", count(t2.text, SITE) === 1);

require("fs").writeFileSync(process.argv[2] + "/mail-preview.html", c2.html + "<hr>" + v2.html);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
