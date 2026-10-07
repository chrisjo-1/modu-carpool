import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F5F7FA", surface: "#FFFFFF", line: "#E5E8EE", ink: "#10141C", sub: "#6B7482",
        accent: "#2F6BFF", accentSoft: "#EAF1FF", warn: "#C2410C", warnSoft: "#FFF4EC",
      },
      fontFamily: { sans: ["Pretendard", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,20,28,.04), 0 8px 24px rgba(16,20,28,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
