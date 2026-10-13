import { db } from "./server";
import { HELP_SECTIONS, type HelpItem, type HelpSection } from "./helpTypes";

export { HELP_SECTIONS, HELP_SECTION_LABEL, type HelpItem, type HelpSection } from "./helpTypes";

/** 처음 한 번만 DB에 채우는 기본 내용. 이후에는 관리자 화면에서 고친다. */
const DEFAULTS: Record<HelpSection, { title: string; body: string }[]> = {
  tutorial: [
    { title: "1. 가입하고 이메일 인증하기", body: "가입하면 회원 번호(8자리)가 자동으로 붙어요. 이메일 인증을 마쳐야 카풀을 신청할 수 있어요." },
    { title: "2. 연락 방법과 출퇴근 정보 등록", body: "내 정보에서 연락 방법(카카오톡, LINE, 텔레그램, WeChat, WhatsApp, 기타)과 아이디를 입력해 주세요. 연락 방법은 신청이 수락된 상대에게만 보여요." },
    { title: "3. 카풀 찾기 또는 올리기", body: "홈에서 출발지·도착지·키워드로 검색해 카풀을 찾아요. 직접 운행한다면 글을 올려 승객을 기다리세요." },
    { title: "4. 신청하고 수락받기", body: "마음에 드는 글에서 신청하면 글 주인에게 알림이 가요. 글 주인이 수락하면 대화를 시작할 수 있어요." },
    { title: "5. 대화하고 약속 잡기", body: "채팅 탭에서 수락된 상대와 대화해요. 대화 항목에 '수락 필요'라고 뜨면 누르면 글 상세에서 수락하거나 거절할 수 있어요." },
    { title: "6. 크레딧 모으기", body: "내 정보에서 매일 출석하면 크레딧이 쌓여요. 주변 호출(CALL)처럼 일부 기능은 크레딧을 써요." },
  ],
  faq: [
    { title: "회원 번호는 무엇인가요?", body: "가입하면 자동으로 붙는 8자리 번호예요(숫자 7자리 + 영문 1자리). 닉네임 대신 사진과 회원 번호로 서로를 구분해요." },
    { title: "연락처는 누구에게 보이나요?", body: "신청이 수락된 상대에게만 보여요. 수락 전에는 아무도 연락 방법을 볼 수 없어요. 차량번호도 같아요." },
    { title: "전화번호를 입력하나요?", body: "아니요. 전화번호는 연락 방법으로 받지 않아요. 카카오톡, LINE, 텔레그램, WeChat, WhatsApp 아이디 또는 기타 중에서 골라 아이디를 입력해요." },
    { title: "계정을 도난당하면 개인정보가 새나요?", body: "연락처와 차량번호는 수락된 상대에게만 보여서, 계정이 노출되어도 신청을 받지 않은 사람에게는 개인정보가 드러나지 않아요. 비밀번호는 안전하게 관리해 주세요." },
    { title: "CALL은 무엇인가요?", body: "내가 올린 카풀 글 하나를 골라 지금 시각으로 다시 올리고, 그 출발지 근처 3km 안의 운전자에게 알려 주는 기능이에요. 반경은 운영자가 정하며 0.5~20km 사이에서 바뀔 수 있어요." },
    { title: "CALL은 크레딧이 얼마나 드나요? 환불되나요?", body: "1,000 크레딧이 들어요. 응답하는 운전자가 없어도 환불되지 않아요. 기술적으로 다시 올리기에 실패한 경우에만 환불돼요." },
    { title: "CALL을 쓰려면 무엇이 필요한가요?", body: "연락 방법과 아이디가 등록되어 있어야 해요. 글이 없다면 먼저 카풀 글을 올려 주세요." },
    { title: "CALL을 받은 운전자는 무엇을 보나요?", body: "호출을 수락하면 호출한 사람의 연락 방법과 아이디를 볼 수 있어요. 수락하지 않으면 아무것도 보이지 않아요." },
    { title: "택시동승 호출은 되나요?", body: "택시동승 호출은 아직 준비 중이에요. 지금은 주변 운전자 호출만 쓸 수 있어요." },
    { title: "크레딧은 어떻게 얻나요?", body: "가입하면 가입 축하 크레딧을 받고, 매일 출석하거나 카풀을 올리면 더 쌓여요. 차량을 등록하면 축하 크레딧도 받아요. 적립 기준은 내 정보에서 'i' 버튼을 누르면 볼 수 있어요." },
    { title: "워프 회원인데 이전 크레딧은 어떻게 받나요?", body: "내 정보의 '워프 회원이신가요?'에서 '예'를 누르고 워프에서 받은 8자리 고유번호를 입력하세요. 한 번만 받을 수 있어요. 워프 회원이 아니라면 '아니오'를 누르면 다시 묻지 않아요." },
    { title: "알림이 오지 않아요.", body: "브라우저에서 알림을 허용했는지 확인해 주세요. 같은 폰에서 계정을 여러 개 쓰면 알림은 마지막으로 로그인한 계정에만 와요." },
    { title: "여러 계정을 같은 폰에서 쓸 수 있나요?", body: "로그인은 한 번에 한 계정만 유지돼요. 계정을 바꾸려면 로그아웃 후 다시 로그인해 주세요." },
    { title: "다른 회원이 불편하게 하면 어떻게 하나요?", body: "신청 목록이나 대화에서 차단할 수 있어요. 차단한 회원은 내 정보의 '차단한 회원'에서 풀 수 있어요. 신고는 대화 화면에서 할 수 있어요." },
    { title: "신고하면 대화 내용을 누가 보나요?", body: "신고가 접수되면 운영자가 판단하기 위해 신고한 사람과 신고된 사람의 대화를 확인할 수 있어요. 확인할 때마다 기록이 남아요." },
    { title: "로그아웃은 어디서 하나요?", body: "내 정보의 '계정' 항목에 있는 로그아웃 버튼을 누르면 돼요." },
  ],
  feedback: [
    { title: "건의, 불편한 점, 새 아이디어 무엇이든 좋아요", body: "운영자가 직접 읽고 답해 드려요. 아래 '의견 보내기'에서 종류를 고르고 적어 주세요." },
  ],
};

/** 섹션에 항목이 하나도 없으면 기본 내용을 넣는다(한 번만). */
export async function seedHelp() {
  const sql = db();
  for (const section of HELP_SECTIONS) {
    const n = await sql`select count(*)::int as n from help_items where section = ${section}`;
    if (Number(n[0].n) > 0) continue;
    const rows = DEFAULTS[section];
    for (let i = 0; i < rows.length; i++) {
      await sql`insert into help_items (section, title, body, sort) values (${section}, ${rows[i].title}, ${rows[i].body}, ${i + 1})`;
    }
  }
}

export const toHelpItem = (r: Record<string, unknown>): HelpItem => ({
  id: Number(r.id),
  section: String(r.section) as HelpSection,
  title: String(r.title),
  body: String(r.body),
  image: String(r.image ?? ""),
  sort: Number(r.sort),
  active: r.active === true,
});
