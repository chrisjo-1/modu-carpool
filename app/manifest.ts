import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "모두의카풀",
    short_name: "모두의카풀",
    description: "같은 방향, 같이 가요. 출퇴근과 서울 나들이 카풀 매칭",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#F5F7FA",
    lang: "ko",
    id: "/",
    scope: "/",
    categories: ["travel", "navigation", "social"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
