import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const title = "모두의카풀 — 같은 방향, 같이 가요";
const description =
  "출퇴근길도 서울 나들이도 방향이 같은 사람과 함께. 무료 운행을 원칙으로 하는 카풀 매칭 서비스입니다. 한국어·English·日本語·中文 지원.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "모두의카풀",
  alternates: { canonical: "/" },
  title: { default: title, template: "%s | 모두의카풀" },
  description,
  keywords: ["카풀", "출퇴근 카풀", "모두의카풀", "모카", "carpool Seoul", "ride share Korea"],
  authors: [{ name: "모두의카풀" }],
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "ko_KR", url: "/", title, description, siteName: "모두의카풀", images: [{ url: "/og.png", width: 1200, height: 630, alt: "모두의카풀 — 같은 방향, 같이 가요" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  formatDetection: { telephone: false },
  appleWebApp: { capable: true, title: "모두의카풀", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F5F7FA" };

// 검색엔진용 구조화 데이터: 웹앱 + 운영 주체
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebApplication", name: "모두의카풀", url: SITE_URL, description, applicationCategory: "TravelApplication", operatingSystem: "Web, iOS, Android", inLanguage: ["ko", "en", "ja", "zh"], offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" } },
    { "@type": "Organization", name: "모두의카풀", url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        {children}
      </body>
    </html>
  );
}
