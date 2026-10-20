/**
 * Keelcode brand geometry: the single source for every rendering (React, static SVG, OG images, 3D).
 *
 * Symbol (64×64): a hull made of code. Rounded "lines of code" whose lengths trace a half-moon hull,
 * with a single keel point beneath; the upper lines are split into tokens.
 *
 * Wordmark: rounded geometric lowercase "keelcode" built from circles and stems (20-unit cell).
 */

export const SONAR = "#35f2c2";
export const INK = "#e4f6f0";
export const ABYSS = "#02060a";

export const MARK = {
  lines: [
    [[11.3, 27.5], [34.5, 52.7]],
    [[13.26, 40.5], [47.5, 50.74]],
    [[20.64, 43.36]],
    [[32, 32]],
  ] as [number, number][][],
  ys: [18, 27.5, 37, 46.5],
  opacity: [1, 0.8, 0.62, 1],
  stroke: 6.6,
};

/** Lowercase rounded glyphs. Baseline y=19, x-height y=7, ascender y=1.5. [path, advance] */
export const GLYPHS: Record<string, [string, number]> = {
  k: ["M2.5 1.5 V19 M2.5 13.5 L10.5 7.5 M6.4 10.6 L11 19", 13.5],
  e: ["M3 13 H15 A6 6 0 1 0 13.24 17.24", 18.5],
  l: ["M2.5 1.5 V16 Q2.5 19 5.5 19", 8.5],
  c: ["M13.24 8.76 A6 6 0 1 0 13.24 17.24", 16.5],
  o: ["M9 7 A6 6 0 1 1 8.99 7 Z", 18.5],
  d: ["M15 1.5 V19 M15 13 A6 6 0 1 0 15 13.01", 18.5],
};
export const WORD = "keelcode";
export const WORDMARK_STROKE = 2.7;
export const wordmarkWidth = () => WORD.split("").reduce((w, ch) => w + GLYPHS[ch][1], 0) - 2.5;
export const glyphOffsets = () => {
  let x = 0;
  return WORD.split("").map((ch) => {
    const o = x;
    x += GLYPHS[ch][1];
    return o;
  });
};

/** Mark segments as [x1, x2, y, opacity] — shared by React, SVG strings and 3D. */
export function markSegments(tokens = true): [number, number, number, number][] {
  return MARK.lines.flatMap((line, i) => {
    const parts = tokens ? line : [[line[0][0], line[line.length - 1][1]] as [number, number]];
    return parts.map(([a, b]) => [a, b, MARK.ys[i], MARK.opacity[i]] as [number, number, number, number]);
  });
}

/** The mark as an SVG <g>, optionally scaled about the centre of a `size` box at (x, y). */
export function markSvgGroup(color = SONAR, scale = 1, x = 0, y = 0, size = 64, tokens = true) {
  const s = (size / 64) * scale;
  const off = (size - 64 * s) / 2;
  const segs = markSegments(tokens).map(([a, b, yy, o]) => `<path d="M${a} ${yy} H${b}" stroke-opacity="${o}"/>`).join("");
  return `<g transform="translate(${x + off} ${y + off}) scale(${s})" fill="none" stroke="${color}" stroke-width="${MARK.stroke}" stroke-linecap="round">${segs}</g>`;
}

/** Standalone symbol SVG. `tile` puts it on a rounded square. */
export function symbolSvg({ size = 512, color = SONAR, tile = false }: { size?: number; color?: string; tile?: boolean } = {}) {
  const bg = tile
    ? `<defs><radialGradient id="t" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#0e3b36"/><stop offset="1" stop-color="${ABYSS}"/></radialGradient></defs><rect width="64" height="64" rx="16" fill="url(#t)"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg}${markSvgGroup(color, tile ? 0.72 : 1)}</svg>`;
}

export function wordmarkSvgGroup(x: number, y: number, height: number, ink = INK, accent = SONAR) {
  const k = height / 20;
  const offs = glyphOffsets();
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="none" stroke-width="${WORDMARK_STROKE}" stroke-linecap="round" stroke-linejoin="round">${WORD.split("")
    .map((ch, i) => `<path d="${GLYPHS[ch][0]}" transform="translate(${offs[i]} 0)" stroke="${i < 4 ? ink : accent}"/>`)
    .join("")}</g>`;
}

/** Horizontal lockup SVG (symbol + wordmark). */
export function logoSvg({ bg = true, ink = INK, accent = SONAR, height = 160 }: { bg?: boolean; ink?: string; accent?: string; height?: number } = {}) {
  const pad = height * 0.22;
  const sym = height - pad * 2;
  const wmH = sym * 0.5;
  const gap = sym * 0.26;
  const wmW = (wordmarkWidth() * wmH) / 20;
  const W = pad + sym + gap + wmW + pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${height}" viewBox="0 0 ${W.toFixed(1)} ${height}">${bg ? `<rect width="100%" height="100%" fill="${ABYSS}"/>` : ""}${markSvgGroup(accent, 1, pad, pad, sym)}${wordmarkSvgGroup(pad + sym + gap, pad + (sym - wmH) / 2 - wmH * 0.1, wmH, ink, accent)}</svg>`;
}
