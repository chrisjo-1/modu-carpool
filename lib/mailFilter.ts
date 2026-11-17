/**
 * 워프 명단 대량 메일에서 미리 빼는 주소(2026-11-17 사용자 지시 '코드 없는 회원 메일 재개 · 반송 줄이기').
 * 첫 발송 반송률이 높았던 도메인(다음·한메일 19%, 카카오 34%, 네이트 8%, 핫메일 28%, 야후 36% 등),
 * 문을 닫은 메일 서비스, 오타 주소(naver.con·gmial.com 등)는 메일 대신 문자·알림톡 대상(smsTargets 'filtered')으로 돌린다.
 * SQL에서 배열로 쓴다: split_part(email,'@',2) <> all(SKIP_DOMAINS) and (첫 이름표 <> all(TYPO_LABELS) or 도메인 = any(GOOD_DOMAINS)).
 */
export const SKIP_DOMAINS: string[] = [
  // 반송이 많은 곳
  "hanmail.net", "daum.net", "nate.com", "kakao.com", "jr.naver.com", "hotmail.com", "hotmail.co.kr", "yahoo.co.kr", "yahoo.com",
  "live.co.kr", "msn.com",
  // 문을 닫았거나 거의 안 쓰는 곳
  "hanmir.com", "dreamwiz.com", "empal.com", "korea.com", "sayclub.com", "paran.com", "lycos.co.kr", "freechal.com", "netian.com",
  "empas.com", "hanafos.com", "hitel.net", "chol.com", "unitel.co.kr", "orgio.net", "intizen.com", "hananet.net", "kornet.net",
  "naver.co.kr", "naver.net", "hanmail.com", "daum.com", "nate.co.kr", "cyworld.com", "hotmail.net", "yahoo.co.jp",
];
/** 이 이름표로 시작하는데 정상 도메인이 아니면 오타로 본다 */
export const TYPO_LABELS: string[] = [
  "naver", "nave", "navr", "naer", "navet", "nvaer", "naber", "navre", "naver2",
  "gmail", "gmial", "gmai", "gamil", "gmali", "gmal", "gmaii", "gnail", "gmeil",
  "hanmail", "hanmil", "hanmial", "hamail", "daum", "dqum",
];
export const GOOD_DOMAINS: string[] = ["naver.com", "gmail.com"];
/** 보내는 순서: gmail 먼저(반송 3.1%), 그다음 naver(3.8%), 나머지 */
export const DOMAIN_ORDER: string[] = ["gmail.com", "naver.com"];
