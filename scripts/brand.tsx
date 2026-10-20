// Generates the static brand assets from components/brand/marks.ts (run: npx tsx scripts/brand.tsx).
import { writeFileSync, mkdirSync } from "node:fs";
import { logoSvg, symbolSvg } from "../components/brand/marks";

mkdirSync("public/brand", { recursive: true });
const files: Record<string, string> = {
  "public/brand/keelcode-symbol.svg": symbolSvg({ size: 512 }),
  "public/brand/keelcode-symbol-tile.svg": symbolSvg({ size: 512, tile: true }),
  "public/brand/keelcode-symbol-mono.svg": symbolSvg({ size: 512, color: "#03080d" }),
  "public/brand/keelcode-logo.svg": logoSvg({ height: 200 }),
  "public/brand/keelcode-logo-transparent.svg": logoSvg({ height: 200, bg: false }),
  "public/brand/keelcode-logo-light.svg": logoSvg({ height: 200, bg: false, ink: "#06141a", accent: "#0b8a6c" }),
  "app/icon.svg": symbolSvg({ size: 64, tile: true }),
};
for (const [p, svg] of Object.entries(files)) writeFileSync(p, svg);
console.log(`wrote ${Object.keys(files).length} brand files`);
