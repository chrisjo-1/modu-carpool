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
    { title: "택시동승 호출은 어떻게 하나요?", body: "CALL 창에서 택시동승 호출을 누르고 출발지·도착지·시각·동승 조건을 적어 보내요. 근처 운전자와 탑승자 모두에게 알리고, 받은 사람이 수락하면 내 연락 방법과 아이디가 보여요. 무료이고 하루 2번까지 쓸 수 있어요." },
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

/**
 * 나중에 더한 기본 내용. 묶음 키(key)마다 한 번만 넣는다(help_seed_log에 기록).
 * 같은 제목이 이미 있으면 넣지 않고, 관리자가 고치거나 지운 항목은 다시 건드리지 않는다.
 */
const ADDITIONS: { key: string; items: { section: HelpSection; title: string; body: string; image?: string }[] }[] = [
  {
    key: "2026-10-subway-karrot",
    items: [
      { section: "tutorial", title: "7. 지하철로 출근한다면 (선택)", body: "내 정보 → 출퇴근 정보에서 '지하철'을 골라 노선·타는 역·내리는 역·시각·요일을 등록해요. 처음 저장하면 2,000 크레딧을 드려요. 그다음 하단 '지하철' 메뉴에서 자리를 나눌 분을 찾아요.", image: "/help/subway-match.svg" },
      { section: "tutorial", title: "8. 운전자라면 등급 배지 받기", body: "내 정보에서 차량번호·차량 사진·프로필 사진을 모두 등록하면 브론즈 배지가 자동으로 붙어요. 배지는 내 글과 프로필, 채팅에서 상대에게 보여요.", image: "/help/tier-badges.svg" },
      { section: "faq", title: "지하철 앉아가기는 무엇인가요?", body: "같은 방향으로 출근하는 분 중, 내가 탄 뒤 1~3정거장 안에 내리는 분을 찾아 그 자리를 이어받게 연결해 줘요. 같은 길·같은 방향이고, 예상 통과 시각이 ±10분 안이며 요일이 겹치면 추천해요. 지금은 출근 방향만 매칭해요.", image: "/help/subway-match.svg" },
      { section: "faq", title: "지하철 정보는 어디서 등록하나요?", body: "내 정보 → 출퇴근 정보에서 운전자 / 탑승자 / 지하철 중 '지하철'을 골라 등록해요. 처음 저장할 때 한 번 2,000 크레딧을 받아요. 오늘만 타는 역·시간이 다르면 지하철 메뉴의 '오늘 출근' 카드에서 [변경]을 눌러 오늘 하루만 바꿀 수 있어요." },
      { section: "faq", title: "탑승 위치 '칸-문'은 어떻게 보나요?", body: "승강장 바닥의 삼각형 표시에 적힌 번호예요. 예를 들어 6-1은 6번째 칸의 1번 문이에요. 문 번호는 1~4예요. 지하철 메뉴 오른쪽 위 '위치 찾는 법'에서도 볼 수 있어요.", image: "/subway/floor-marker.webp" },
      { section: "faq", title: "같은 칸에 탔는지 어떻게 확인하나요?", body: "열차 안 문 위에 적힌 4자리 차량번호를 입력하면 돼요(선택). 번호가 같으면 같은 칸이에요. 상대의 번호는 보여 주지 않고, 하루 뒤 지워져요.", image: "/subway/car-number.webp" },
      { section: "faq", title: "'내 자리 알리기'는 어떻게 하나요?", body: "자리를 양보하는 분이 오늘 앉은 위치를 알려 주는 곳이에요. ① 칸을 고르고 ② 차량 그림에서 좌석을 누르고 ③ 오늘의 힌트(옷 색깔 등 80자, 사진 1장 선택)를 적어요. 저장하면 수락된 상대에게 알림이 가고, 상대 화면에도 같은 그림으로 보여요. 오늘 하루만 저장돼요.", image: "/help/seat-map.svg" },
      { section: "faq", title: "'앉을 칸 찾기'의 적중확률은 무엇인가요?", body: "서울교통공사 시간대별 혼잡도와 그동안 모인 착석 기록으로, 내 탑승역·방향·시각에 앉기 쉬운 칸을 추정한 값이에요. 기록이 30건 이상 쌓이면 실제 기록 순위로 보여 줘요. 참고용이라 실제와 다를 수 있어요." },
      { section: "faq", title: "지하철 CALL은 무엇인가요?", body: "지하철 메뉴의 보라색 떠 있는 버튼이에요. 지금 1~3정거장 안에 있는 상대 모두에게 한 번에 요청과 알림을 보내요. 자리를 받고 싶은지, 양보하려는지는 등록 정보로 자동으로 정해져요. 크레딧이 들지 않아요." },
      { section: "faq", title: "지하철 상대에게 내 정보가 어디까지 보이나요?", body: "수락 전에는 정거장 수·타는 역·시각만 보여요. 수락한 뒤에야 내리는 역, 양보하는 분의 오늘 자리 위치, 등록한 연락처, 대화가 열려요. 서로 차단하면 대화도 할 수 없어요." },
      { section: "faq", title: "운전자 등급 배지는 어떻게 받나요?", body: "브론즈는 차량번호·차량 사진·프로필 사진을 모두 등록하면 자동으로 붙어요. 실버·골드는 지금은 운영자가 확인한 뒤 지정해요. 배지는 운전자에게만 붙고, 홈 글·프로필·채팅에서 상대가 볼 수 있어요.", image: "/help/tier-badges.svg" },
      { section: "faq", title: "나의 당근함은 무엇인가요?", body: "당근마켓에 올린 내 물건 링크를 모아 두는 곳이에요(30개까지, 사진 2장). 내 정보 → 나의 당근함에서 등록해요. 다른 회원은 내 프로필을 열면 내 당근함을 보고, 누르면 당근마켓 글로 이동해요. 실제 거래는 당근마켓에서 해요." },
      { section: "faq", title: "카풀 보상은 무엇인가요?", body: "운전자 글에 신청해 수락된 탑승자가, 고마움의 표시로 당근함의 물건을 골라 운전자에게 보낼 수 있어요. 운전자는 내 정보 → 카풀 보상에서 받은 물건을 보고 '받았어요'를 눌러요. 물건은 당사자끼리 만나서 주고받아요." },
      { section: "faq", title: "푸시 알림을 껐는데 다시 와요.", body: "알림은 기본으로 켜져 있어요. 끄면 잠시 멈추는 것이고, 10일 넘게 접속하지 않으면 중요한 소식을 놓치지 않도록 다시 켜져요. 브라우저에서 알림 권한을 허용해 두면 로그인할 때 자동으로 연결돼요." },
      { section: "faq", title: "버튼을 눌렀는데 설명 말풍선만 떠요.", body: "새 기능의 버튼은 처음 누를 때 한 번만 설명이 떠요. 그때는 실행되지 않으니 한 번 더 눌러 주세요. 다음부터는 바로 실행돼요." },
    ],
  },
];

let additionsDone = false;
async function applyAdditions() {
  if (additionsDone) return;
  const sql = db();
  await sql`create table if not exists help_seed_log (key text primary key, at timestamptz not null default now())`;
  for (const pack of ADDITIONS) {
    const done = await sql`select 1 from help_seed_log where key = ${pack.key}`;
    if (done.length) continue; // 이미 넣은 묶음
    for (const it of pack.items) {
      const exists = await sql`select 1 from help_items where section = ${it.section} and title = ${it.title} limit 1`;
      if (exists.length) continue;
      const m = await sql`select coalesce(max(sort), 0)::int as m from help_items where section = ${it.section}`;
      await sql`insert into help_items (section, title, body, image, sort) values (${it.section}, ${it.title}, ${it.body}, ${it.image ?? ""}, ${Number(m[0].m) + 1})`;
    }
    // 다 넣은 뒤에 기록한다(중간에 실패하면 다음 요청에서 빠진 것만 다시 넣는다).
    await sql`insert into help_seed_log (key) values (${pack.key}) on conflict do nothing`;
  }
  additionsDone = true;
}

/** 섹션에 항목이 하나도 없으면 기본 내용을 넣는다(한 번만). 나중에 더한 묶음도 한 번씩 넣는다. */
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
  await applyAdditions();
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
