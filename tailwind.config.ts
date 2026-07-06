import type { Config } from "tailwindcss";

const dunggeureColors = {
  primary: "#8080FF",
  dark: "#9a94d0",
  light: "#c8c8ff",
  lighter: "#f0f0ff",
  secondary: "#e8e6ff",
  tertiary: "#aa141d",
};

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        dunggeure: dunggeureColors,
        day: {
          sun: "#aa141d",
          mon: "#9a94d0",
          sat: "#8080FF",
          rest: "#d8d8d8",
          collab: "#e8e6ff",
          highlight: "#8080FF",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        "display-bold": ["var(--font-display-bold)", "sans-serif"],
        body: [
          "var(--font-body)",
          "Pretendard",
          "Noto Sans KR",
          "Apple SD Gothic Neo",
          "sans-serif",
        ],
        hakgyoansimnadeuri: [
          "var(--font-hakgyoansimnadeuri)",
          "var(--font-gamjaflower)",
          "Pretendard",
          "Noto Sans KR",
          "Apple SD Gothic Neo",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
