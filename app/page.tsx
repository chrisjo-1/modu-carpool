import type { Metadata } from "next";
import App from "@/components/App";
import HomeSeo from "@/components/HomeSeo";
import { getSeoHome } from "@/lib/seo";

// 홈 아래 서비스 소개·최근 카풀 글은 10분마다 다시 만든다(첫 화면 요청을 막지 않음).
export const revalidate = 600;

// 홈 제목·설명·키워드는 관리자 'SEO 키워드' 탭에서 고친다(settings seo_home, 10분 캐시, 실패하면 기본 문구).
export async function generateMetadata(): Promise<Metadata> {
  const h = await getSeoHome();
  const og = { url: "/og-v2.png", width: 1200, height: 630, alt: "모두의카풀 — 출퇴근 카풀·지하철 앉아가기·여성 안심동행" };
  return {
    title: { absolute: h.title },
    description: h.description,
    keywords: h.keywords,
    openGraph: { type: "website", locale: "ko_KR", url: "/", title: h.title, description: h.description, siteName: "모두의카풀", images: [og] },
    twitter: { card: "summary_large_image", title: h.title, description: h.description, images: ["/og-v2.png"] },
  };
}

export default function Page() {
  return <App seo={<HomeSeo />} />;
}
