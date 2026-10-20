/**
 * Keelcode brand components. Geometry lives in ./marks.ts (single source for every rendering).
 */
import { GLYPHS, INK, MARK, SONAR, WORD, WORDMARK_STROKE, glyphOffsets, markSegments, wordmarkWidth } from "./marks";

export { SONAR, INK };

/** The symbol: a hull made of rounded lines of code, ending in a keel point. */
export function KeelcodeMark({
  size = 32,
  color = SONAR,
  ping = false,
  tokens = true,
  className = "",
  title = "Keelcode",
}: {
  size?: number;
  color?: string;
  dot?: string;
  ping?: boolean;
  tokens?: boolean;
  className?: string;
  title?: string;
}) {
  const segs = markSegments(tokens);
  const keel = segs[segs.length - 1];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      <g fill="none" stroke={color} strokeWidth={MARK.stroke} strokeLinecap="round">
        {segs.map(([a, b, y, o], i) => (
          <path key={i} d={`M${a} ${y} H${b}`} strokeOpacity={o} />
        ))}
      </g>
      {ping && (
        <circle cx={keel[0]} cy={keel[2]} r={MARK.stroke / 2} fill="none" stroke={color} strokeWidth="1.4" className="animate-[ping_2.2s_cubic-bezier(0,0,.2,1)_infinite] motion-reduce:hidden" style={{ transformOrigin: `${keel[0]}px ${keel[2]}px`, transformBox: "view-box" }} />
      )}
    </svg>
  );
}

/** Rounded geometric lowercase wordmark: "keel" in ink, "code" in sonar. */
export function Wordmark({ height = 20, className = "", ink = INK, accent = SONAR }: { height?: number; className?: string; ink?: string; accent?: string }) {
  const w = wordmarkWidth();
  const offs = glyphOffsets();
  return (
    <svg height={height} viewBox={`0 0 ${w} 20`} className={className} role="img" aria-label="Keelcode" style={{ width: (height * w) / 20, overflow: "visible" }}>
      <g fill="none" strokeWidth={WORDMARK_STROKE} strokeLinecap="round" strokeLinejoin="round">
        {WORD.split("").map((ch, i) => (
          <path key={i} d={GLYPHS[ch][0]} transform={`translate(${offs[i]} 0)`} stroke={i < 4 ? ink : accent} />
        ))}
      </g>
    </svg>
  );
}

/** Horizontal lockup: symbol + wordmark (+ optional tagline). */
export function Logo({ size = 36, tagline = true, className = "" }: { size?: number; tagline?: boolean; className?: string }) {
  return (
    <div className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <KeelcodeMark size={size} className="drop-shadow-[0_0_10px_rgba(53,242,194,.45)]" />
      <div className="flex flex-col gap-1 leading-none">
        <Wordmark height={size * 0.62} />
        {tagline && <span className="pl-[1px] font-mono text-[9px] uppercase tracking-[0.3em] text-sonar/70">Subsurface code recon</span>}
      </div>
    </div>
  );
}
