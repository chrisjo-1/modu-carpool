import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F5F7FA", surface: "#FFFFFF", line: "#E5E8EE", ink: "#10141C", sub: "#6B7482",
        // 로고 색(2026-11-05 새 로고: 잉크 네이비 + 코랄 점). 로고·아이콘에만 쓰고 버튼 색 규칙은 그대로.
        brand: "#101B33", coral: "#FF5A3C",
        accent: "#2F6BFF", accentSoft: "#EAF1FF", warn: "#C2410C", warnSoft: "#FFF4EC", mint: "#00754A", mintSoft: "#E7F7EE",
        violet: "#7C3AED", violetSoft: "#F3EEFF",
        // 지하철: 고른 노선 색(SubwayTab이 lineTheme으로 CSS 변수를 넣음, 없으면 로고 남색)
        lc: "var(--lc, #101B33)", lcSoft: "var(--lc-soft, #EEF0F5)", lcInk: "var(--lc-ink, #FFFFFF)",
        mind: "#EC4899", mindSoft: "#FFF0F6", mindInk: "#BE185D",
      },
      fontFamily: { sans: ["Pretendard Variable", "Pretendard", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,20,28,.04), 0 8px 24px rgba(16,20,28,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
