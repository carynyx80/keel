// Generates the static brand assets from components/brand/Logo.tsx geometry.
import { writeFileSync } from "node:fs";
import { symbolSvg, wordmarkPaths, WORDMARK_WIDTH, SYMBOL_PATHS, SONAR } from "../components/brand/Logo";

const ABYSS = "#02060a";
const sym = (x: number, y: number, s: number, color = SONAR) =>
  `<g transform="translate(${x} ${y}) scale(${s / 64})"><path d="${SYMBOL_PATHS.hull}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linejoin="miter" stroke-linecap="square"/><path d="${SYMBOL_PATHS.keel}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="square"/><circle cx="32" cy="29" r="7" fill="none" stroke="${color}" stroke-width="1.7" stroke-opacity="0.5"/><circle cx="32" cy="29" r="2.9" fill="${color}"/></g>`;

function lockup(bg: boolean, ink = "#d7f2ea", accent = SONAR) {
  const S = 96, gap = 28, wmH = 42, sc = wmH / 20;
  const W = 48 + S + gap + WORDMARK_WIDTH * sc + 48, H = 48 + S + 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg ? `<rect width="${W}" height="${H}" fill="${ABYSS}"/>` : ""}${sym(48, 48, S, accent)}${wordmarkPaths(48 + S + gap, 48 + (S - wmH) / 2 - 2, sc, ink, accent)}</svg>`;
}

writeFileSync("public/brand/keelcode-symbol.svg", symbolSvg({ size: 512 }));
writeFileSync("public/brand/keelcode-symbol-tile.svg", symbolSvg({ size: 512, bg: ABYSS }));
writeFileSync("public/brand/keelcode-symbol-mono.svg", symbolSvg({ size: 512, color: "#02060a" }));
writeFileSync("public/brand/keelcode-logo.svg", lockup(true));
writeFileSync("public/brand/keelcode-logo-transparent.svg", lockup(false));
writeFileSync("public/brand/keelcode-logo-light.svg", lockup(false, "#03080d", "#0b8a6c"));
writeFileSync("app/icon.svg", symbolSvg({ size: 64, bg: ABYSS }));
console.log("brand assets written");
