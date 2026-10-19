import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        hull: { 950: "#04070b", 900: "#070d14", 800: "#0c1620", 700: "#13212e", 600: "#1d3142" },
        sonar: { DEFAULT: "#2cf5c8", dim: "#1aa587", glow: "#7dffe2" },
        ink: { DEFAULT: "#e6f1f5", dim: "#9fb3bf", faint: "#5d7380" },
        alarm: "#ff6b5e",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
