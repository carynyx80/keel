// Satori-safe (next/og) renderings of the brand marks: plain <svg> JSX, no classes.
import { GLYPHS, INK, MARK, SONAR, WORD, WORDMARK_STROKE, glyphOffsets, markSegments, wordmarkWidth } from "./marks";

export function OgSymbol({ size, color = SONAR }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      {markSegments().map(([a, b, y, o], i) => (
        <path key={i} d={`M${a} ${y} H${b}`} fill="none" stroke={color} strokeOpacity={o} strokeWidth={MARK.stroke} strokeLinecap="round" />
      ))}
    </svg>
  );
}

export function OgWordmark({ height }: { height: number }) {
  const w = wordmarkWidth();
  const offs = glyphOffsets();
  return (
    // pad the canvas so round caps aren't clipped (satori clips to the viewBox)
    <svg width={(height * (w + 4)) / 20} height={(height * 24) / 20} viewBox={`-2 -2 ${w + 4} 24`}>
      {WORD.split("").map((ch, i) => (
        <path key={i} d={GLYPHS[ch][0]} transform={`translate(${offs[i]} 0)`} fill="none" stroke={i < 4 ? INK : SONAR} strokeWidth={WORDMARK_STROKE} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
