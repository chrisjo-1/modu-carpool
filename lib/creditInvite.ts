/**
 * 워프 회원 크레딧 이관 안내(문자·카톡용, 2026-11-17 사용자 지시).
 * 회원별 링크 /s/<코드>(kakao_links, template_key credit-invite, next credit) → 비번 설정(또는 로그인) 뒤 크레딧 이관 신청 창이 바로 열린다.
 * 공용 링크 /credit → 로그인 뒤 같은 창.
 */
export const CREDIT_INVITE_KEY = "credit-invite";
export const creditInviteText = (link: string) =>
  `안녕하세요, 현재 개발 막바지인 워프 후속 신규 플랫폼 모두의카풀입니다. 회원 정보는 등록해 두었으니 아래 링크로 접속하셔서 크레딧 이관 신청만 해 주세요.\n${link}`;
