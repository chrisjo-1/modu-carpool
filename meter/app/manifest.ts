import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "모카 미터기",
    short_name: "모카 미터기",
    description: "카풀 비용 나눔 참고 미터기",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#F5F7FA",
    lang: "ko",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
