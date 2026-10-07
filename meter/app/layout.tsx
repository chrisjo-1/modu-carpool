import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "모카 미터기 — 카풀 비용 나눔 미터기";
const description =
  "앱 설치 없이 바로 쓰는 카풀 미터기. GPS로 주행 거리를 재고 택시 요율 기준 참고 금액과 1인 부담액을 계산합니다. 모두의카풀이 만듭니다.";

export const metadata: Metadata = {
  title: { default: title, template: "%s | 모카 미터기" },
  description,
  keywords: ["카풀 미터기", "카풀 비용", "N빵 미터기", "카풀 정산", "모두의카풀", "모카"],
  authors: [{ name: "모두의카풀" }],
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "ko_KR", title, description, siteName: "모카 미터기" },
  twitter: { card: "summary", title, description },
  appleWebApp: { capable: true, title: "모카 미터기", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F7FA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
