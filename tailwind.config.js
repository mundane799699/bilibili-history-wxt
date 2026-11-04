/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["assets/**", "entrypoints/**", "pages/**", "components/**"],
  theme: {
    extend: {
      colors: {
        // 品牌色：与官网（bilibilihistory.com）一致
        brand: {
          DEFAULT: "#fb7299",
          strong: "#f05a84",
          soft: "#fff2f6",
        },
        // 文字与中性色：官网用墨黑而不是纯灰
        ink: {
          DEFAULT: "#17191a",
          soft: "#2d3032",
          muted: "#86898c",
          faint: "#bcbec0",
        },
        line: "#ececec",
        wash: "#f6f6f6",
        paper: "#ffffff",
        // 暗色主题
        night: {
          DEFAULT: "#0e0f10",
          card: "#17191a",
          line: "#27292c",
          text: "#e9e9ea",
          muted: "#9a9da0",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -12px rgba(16,24,40,0.10)",
        lift: "0 2px 4px rgba(16,24,40,0.04), 0 16px 40px -16px rgba(16,24,40,0.16)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
