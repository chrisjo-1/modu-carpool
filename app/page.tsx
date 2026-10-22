import App from "@/components/App";
import HomeSeo from "@/components/HomeSeo";

// 홈 아래 서비스 소개·최근 카풀 글은 10분마다 다시 만든다(첫 화면 요청을 막지 않음).
export const revalidate = 600;

export default function Page() {
  return <App seo={<HomeSeo />} />;
}
