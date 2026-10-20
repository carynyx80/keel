/**
 * Keelcode brand.
 * KeelcodeMark: code brackets ‹ › whose lower arms close into a V-hull, a keel fin beneath,
 * and a sonar contact at the centre — code and vessel in one shape.
 * Wordmark: chamfered geometric letters drawn as paths (no font dependency).
 */

export const SONAR = "#35f2c2";
export const INK = "#d7f2ea";

/** KeelcodeMark geometry on a 64×64 grid. */
export const SYMBOL_PATHS = {
  hull: "M23 11 L8 27 L32 51 L56 27 L41 11",
  keel: "M32 51 V61",
};

export function KeelcodeMark({
  size = 32,
  color = SONAR,
  dot = SONAR,
  strokeWidth = 4.5,
  ping = false,
  className = "",
  title = "Keelcode",
}: {
  size?: number;
  color?: string;
  dot?: string;
  strokeWidth?: number;
  ping?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <path d={SYMBOL_PATHS.hull} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="miter" strokeLinecap="square" />
      <path d={SYMBOL_PATHS.keel} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" />
      <circle cx="32" cy="29" r="7" fill="none" stroke={dot} strokeWidth={strokeWidth * 0.38} strokeOpacity="0.5" />
      <circle cx="32" cy="29" r="2.9" fill={dot} />
      {ping && (
        <circle cx="32" cy="29" r="7" fill="none" stroke={dot} strokeWidth="1.2" className="origin-[32px_29px] animate-[ping_2.4s_cubic-bezier(0,0,.2,1)_infinite] motion-reduce:hidden" />
      )}
    </svg>
  );
}

/** Wordmark glyphs on a 12×20 cell, stroke-drawn. */
const GLYPHS: Record<string, string> = {
  K: "M1.5 1.5 V18.5 M1.5 11.5 L11.5 1.5 M6 7 L12 18.5",
  E: "M12 1.5 H1.5 V18.5 H12 M1.5 10 H10",
  L: "M1.5 1.5 V18.5 H12",
  C: "M12 1.5 H4.5 L1.5 4.5 V15.5 L4.5 18.5 H12",
  O: "M4.5 1.5 H8.5 L11.5 4.5 V15.5 L8.5 18.5 H4.5 L1.5 15.5 V4.5 Z",
  D: "M1.5 1.5 H7.5 L11.5 5.5 V14.5 L7.5 18.5 H1.5 Z",
};
const ADV = 17; // advance per glyph

export function Wordmark({ height = 20, className = "", ink = INK, accent = SONAR }: { height?: number; className?: string; ink?: string; accent?: string }) {
  const word = "KEELCODE";
  const w = word.length * ADV - 5;
  return (
    <svg height={height} viewBox={`0 0 ${w} 20`} className={className} role="img" aria-label="Keelcode" style={{ width: (height * w) / 20 }}>
      {word.split("").map((ch, i) => (
        <path key={i} d={GLYPHS[ch]} transform={`translate(${i * ADV} 0)`} fill="none" stroke={i < 4 ? ink : accent} strokeWidth="3" strokeLinejoin="miter" strokeLinecap="square" />
      ))}
    </svg>
  );
}

/** Horizontal lockup: symbol + wordmark (+ optional tagline). */
export function Logo({ size = 34, tagline = true, className = "" }: { size?: number; tagline?: boolean; className?: string }) {
  return (
    <div className={`flex shrink-0 items-center gap-3 ${className}`}>
      <KeelcodeMark size={size} className="drop-shadow-[0_0_10px_rgba(53,242,194,.55)]" />
      <div className="flex flex-col gap-1.5 leading-none">
        <Wordmark height={size * 0.44} />
        {tagline && <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-sonar/70">Subsurface code recon</span>}
      </div>
    </div>
  );
}

/** Standalone SVG markup (for static files / image routes). */
export function symbolSvg({ size = 64, bg = "", color = SONAR }: { size?: number; bg?: string; color?: string } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${bg ? `<rect width="64" height="64" rx="12" fill="${bg}"/>` : ""}<path d="${SYMBOL_PATHS.hull}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linejoin="miter" stroke-linecap="square"/><path d="${SYMBOL_PATHS.keel}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="square"/><circle cx="32" cy="29" r="7" fill="none" stroke="${color}" stroke-width="1.7" stroke-opacity="0.5"/><circle cx="32" cy="29" r="2.9" fill="${color}"/></svg>`;
}

export function wordmarkPaths(x: number, y: number, scale: number, ink = INK, accent = SONAR) {
  return "KEELCODE"
    .split("")
    .map((ch, i) => `<path d="${GLYPHS[ch]}" transform="translate(${x + i * ADV * scale} ${y}) scale(${scale})" fill="none" stroke="${i < 4 ? ink : accent}" stroke-width="3" stroke-linejoin="miter" stroke-linecap="square"/>`)
    .join("");
}
export const WORDMARK_WIDTH = 8 * ADV - 5;
