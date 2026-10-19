import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abyss: "#02060a",
        hull: { 950: "#03080d", 900: "#061019", 800: "#0a1824", 700: "#0f2231", 600: "#173246" },
        sonar: { DEFAULT: "#35f2c2", dim: "#1f9f80", glow: "#9dffe6", deep: "#0d3d33" },
        amber: { DEFAULT: "#ffb547", dim: "#a8742a" },
        ink: { DEFAULT: "#d7f2ea", dim: "#86a8a0", faint: "#4d6b65" },
        alarm: "#ff5a4f",
      },
      fontFamily: {
        hud: ["var(--font-hud)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0.25" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        sweep: { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
      },
      animation: {
        blink: "blink 1.1s steps(1) infinite",
        scan: "scan 6s linear infinite",
        rise: "rise .35s ease-out both",
        sweep: "sweep 4s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
