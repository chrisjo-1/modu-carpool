import type { Metadata } from "next";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { SITE_URL } from "@/lib/site";

/**
 * '카풀'·'카풀 앱' 검색어용 안내 페이지(2026-11-19 사용자 지시: 네이버·구글에서 카풀 키워드로 검색되게).
 * 서버 렌더 정적 페이지. 내용을 고치면 sitemap.ts의 날짜도 바꾼다.
 */
const title = "카풀 앱 추천 · 카풀 구하는 법 — 모두의카풀";
const description =
  "카풀 앱 모두의카풀로 같은 방향 출퇴근 카풀을 무료로 구하세요. 카풀 구하는 법, 카풀 비용(평일 출퇴근 시간 실비 분담), 카풀 앱 고르는 기준, 안전하게 타는 방법을 정리했어요.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  keywords: ["카풀", "카풀 앱", "카풀 어플", "카풀 앱 추천", "카풀 구하기", "출퇴근 카풀", "카풀 비용", "모두의카풀"],
  alternates: { canonical: "/carpool-app" },
  openGraph: { title, description, url: "/carpool-app", type: "article" },
};

const FAQ: { q: string; a: string }[] = [
  { q: "카풀 앱은 무료인가요?", a: "모두의카풀은 가입과 글 올리기, 신청, 대화가 모두 무료예요. 카풀 자체도 무료 운행이 원칙이고, 평일 출퇴근 시간에만 운전자와 탑승자가 실비(기름값·통행료 등)를 나눌 수 있어요." },
  { q: "카풀로 돈을 받아도 되나요?", a: "여객자동차 운수사업법은 출퇴근 때 승용차를 함께 타는 경우에 한해 비용을 받는 것을 허용해요(평일 오전 7~9시, 오후 6~8시, 주말·공휴일 제외). 모두의카풀은 그 시간 밖의 글은 무료로만 올리게 해서 영업이 아닌 실비 분담이 되도록 돕고 있어요." },
  { q: "카풀은 어떻게 구하나요?", a: "출발지와 도착지, 출근·퇴근 시각을 등록하면 같은 길을 가는 운전자나 탑승자 글이 가까운 순으로 보여요. 마음에 드는 글에 신청하고, 글쓴이가 수락하면 대화방에서 만날 곳과 시간을 정하면 돼요." },
  { q: "운전자와 탑승자 모두 쓸 수 있나요?", a: "네. 화면 오른쪽 위에서 운전자 모드와 탑승자 모드를 바꿀 수 있어요. 운전자는 빈자리를 나누고, 탑승자는 같은 방향 차를 찾거나 CALL로 주변 운전자에게 함께 가자고 요청할 수 있어요." },
  { q: "모르는 사람과 타도 안전한가요?", a: "프로필 사진과 운전자 등급, 지난 카풀 별점을 보고 고를 수 있어요. 여성 회원은 수락된 카풀에서 안심동행을 신청하면 도착할 때까지 운영팀이 함께 지켜보고, 불편한 회원은 신고·차단할 수 있어요." },
  { q: "워프(warp) 카풀 앱은 어떻게 됐나요?", a: "워프가 모두의카풀로 이름을 바꾸고 새로 만들어졌어요. 워프 회원은 워프 고유번호로 크레딧 이관을 신청할 수 있어요." },
];

export default function Page() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <PublicPage blockId="S306" name="카풀 앱 안내" crumbs={[{ href: "/carpool-app", label: "카풀 앱" }]}>
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "카풀 앱", url: `${SITE_URL}/carpool-app` }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }} />

      <h1 className="text-[26px] font-bold leading-tight">카풀 앱 모두의카풀 — 같은 방향 카풀 구하기</h1>
      <p className="mt-3 text-sub">
        카풀은 같은 방향으로 가는 사람끼리 차 한 대에 함께 타는 것을 말해요. 운전자는 빈자리를 나눠 기름값과 차량 유지비 부담을 덜고, 탑승자는 대중교통보다 편하게 출퇴근할 수 있어요.
        모두의카풀은 출퇴근길이 같은 이웃을 이어 주는 카풀 앱으로, 가입과 이용이 모두 무료예요.
      </p>
      <p className="mt-3">
        <a href="/" className="inline-block rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-white">지금 열린 카풀 보기</a>
      </p>

      <h2 className="mt-8 text-[18px] font-bold">카풀 구하는 법 (3단계)</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li><b>출퇴근 정보 등록</b> — 집(출발지)과 회사(도착지), 출근·퇴근 시각, 요일을 적으면 정기카풀 글로 바로 올라가요.</li>
        <li><b>같은 길 회원 찾기</b> — 찾기 화면에서 거리순·출발순으로 보거나, [경로 분석]으로 내 길과 겹치는 운전자·탑승자를 지도에서 확인해요.</li>
        <li><b>신청하고 대화하기</b> — 신청이 수락되면 대화방에서 만날 곳과 시간을 정해요. 정기카풀은 앱 안에서 계약서로 요일·시간·비용을 함께 정해 둘 수 있어요.</li>
      </ol>

      <h2 className="mt-8 text-[18px] font-bold">카풀 앱을 고를 때 볼 것</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sub">
        <li><b className="text-ink">내 동네 회원이 있는지</b> — 카풀은 같은 길을 가는 사람이 있어야 이뤄져요. 모두의카풀은 예전 카풀 앱 워프 회원의 출퇴근 경로까지 함께 보여 줘요. <a href="/carpool" className="underline">지역별 카풀 보기</a></li>
        <li><b className="text-ink">비용 기준이 분명한지</b> — 영업처럼 돈을 버는 앱이 아니라, 평일 출퇴근 시간에만 실비를 나누는 구조인지 확인하세요.</li>
        <li><b className="text-ink">상대를 확인할 수 있는지</b> — 프로필 사진, 차량 등록, 운전자 등급 배지, 별점이 있으면 처음 만나는 상대도 고르기 쉬워요.</li>
        <li><b className="text-ink">알림이 잘 오는지</b> — 신청·수락·대화가 바로 알림으로 와야 약속이 어긋나지 않아요. 앱 안 알림함에도 기록이 남아요.</li>
      </ul>

      <h2 className="mt-8 text-[18px] font-bold">모두의카풀의 특징</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sub">
        <li><b className="text-ink">정기카풀</b> — 매일 같은 시간 출퇴근하는 분과 요일·시각을 맞춰 꾸준히 함께 타요.</li>
        <li><b className="text-ink">CALL</b> — 탑승자가 출발 30분~24시간 전에 주변 운전자에게 &ldquo;같이 가요&rdquo;를 보내요. 시간도 맞는 운전자에게 먼저 알려요.</li>
        <li><b className="text-ink">경로 분석</b> — 같은 길 회원 수, 상대 출발 시각대, 탑승자가 모이는 곳을 지도에서 보여 주고, 카풀로 내 차 월 납입금을 얼마나 덜 수 있는지 계산해요.</li>
        <li><b className="text-ink">여성 안심동행</b> — 여성 회원이 신청하면 탑승부터 도착까지 운영팀이 함께 지켜봐요.</li>
        <li><b className="text-ink">지하철 앉아가기</b> — 차가 없는 날엔 지하철에서 앉을 확률이 높은 칸과 곧 내리는 분을 알려 줘요. <a href="/subway" className="underline">노선별 안내</a></li>
      </ul>

      <h2 className="mt-8 text-[18px] font-bold">카풀 비용은 얼마가 적당할까</h2>
      <p className="mt-3 text-sub">
        카풀은 무료로 함께 타는 것이 기본이에요. 평일 출퇴근 시간(오전 7~9시, 오후 6~8시)에는 운전자와 탑승자가 기름값·통행료 같은 실비를 나눌 수 있고, 모두의카풀은 그 밖의 시간에 올리는 글은 무료로만 올리게 해요.
        정기카풀은 회당 금액이나 월 정액으로 정해 두면 서로 편해요. 모두의카풀의 목표는 카풀로 나눈 비용이 차량 할부·리스 납입금과 유지비 부담을 덜어 주는 것이에요.
      </p>

      <h2 className="mt-8 text-[18px] font-bold">자주 묻는 질문</h2>
      <dl className="mt-3 space-y-4">
        {FAQ.map((f) => (
          <div key={f.q}>
            <dt className="font-semibold">{f.q}</dt>
            <dd className="mt-1 text-sub">{f.a}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 flex flex-wrap gap-x-3 gap-y-1 text-[14px]">
        <a href="/carpool" className="underline">지역별 카풀</a>
        <a href="/faq" className="underline">자주 묻는 질문 전체</a>
        <a href="/warp" className="underline">워프에서 모두의카풀로</a>
      </p>
    </PublicPage>
  );
}
