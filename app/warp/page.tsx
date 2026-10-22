import type { Metadata } from "next";
import PublicPage, { BreadcrumbLd } from "@/components/PublicPage";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "워프(warp) 카풀이 모두의카풀이 됐어요",
  description: "카풀 앱 워프(warp)가 모두의카풀로 이름을 바꿨어요. 워프 회원은 워프에 쓴 이메일이나 고유번호로 가입하면 회원 확인 뒤 이전 축하 크레딧을 받아요.",
  alternates: { canonical: "/warp" },
  openGraph: { title: "워프 카풀이 모두의카풀이 됐어요", url: "/warp" },
};

export default function Page() {
  return (
    <PublicPage blockId="S305" name="워프에서 모두의카풀로">
      <BreadcrumbLd items={[{ name: "모두의카풀", url: SITE_URL }, { name: "워프에서 모두의카풀로", url: `${SITE_URL}/warp` }]} />
      <h1 className="text-[26px] font-bold leading-tight">워프(warp) 카풀이 모두의카풀이 됐어요</h1>
      <p className="mt-3 text-sub">국내 카풀 커뮤니티 앱 워프가 &lsquo;모두의카풀&rsquo;로 이름을 바꾸고 새로 만들어졌어요. 같은 방향 사람과 함께 타는 출퇴근 카풀은 그대로이고, 지하철에서 앉을 칸을 알려 주는 &lsquo;지하철 앉아가기&rsquo;가 새로 생겼어요.</p>

      <h2 className="mt-8 text-[18px] font-bold">워프 회원이었다면</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>모두의카풀에서 회원가입을 눌러요.</li>
        <li>가입 화면의 워프 회원 안내에서 워프 고유번호(8자리)나 워프에 쓴 이메일을 입력해요.</li>
        <li>받은 확인 메일의 링크를 누르면 워프 회원 확인이 끝나고 이전 축하 크레딧이 적립돼요.</li>
      </ol>

      <h2 className="mt-8 text-[18px] font-bold">무엇이 달라졌나요</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sub">
        <li>출퇴근 정보를 한 번 등록하면 정기카풀 글로 바로 올라가요.</li>
        <li>CALL 버튼으로 주변 운전자에게 바로 호출할 수 있어요.</li>
        <li>지하철 앉아가기: 지금 시간·역 기준으로 앉을 확률이 높은 칸을 알려 주고, 곧 내리는 분과 자리를 이어 줘요. <a href="/subway" className="underline">노선별 안내 보기</a></li>
        <li>무료 운행이 원칙이에요. 평일 출퇴근 시간에만 비용을 나눌 수 있어요. <a href="/faq" className="underline">카풀 규제 질문 보기</a></li>
      </ul>
    </PublicPage>
  );
}
