import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#10140e",
          900: "#161b13",
          800: "#1f261b",
          700: "#2a3325",
        },
        paper: "#efe7d4",
        mist: "#c9c3b2",
        lime: {
          DEFAULT: "#d4f06a",
          dim: "#a8c44f",
        },
        clay: "#e07a4a",
        lagoon: "#6ec4b8",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        lift: "0 24px 60px -28px rgba(0,0,0,0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
