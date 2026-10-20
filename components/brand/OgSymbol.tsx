// Satori-safe (next/og) renderings of the brand marks: plain <svg> JSX, no classes.
import { SYMBOL_PATHS } from "./Logo";

const GLYPHS: Record<string, string> = {
  K: "M1.5 1.5 V18.5 M1.5 11.5 L11.5 1.5 M6 7 L12 18.5",
  E: "M12 1.5 H1.5 V18.5 H12 M1.5 10 H10",
  L: "M1.5 1.5 V18.5 H12",
  C: "M12 1.5 H4.5 L1.5 4.5 V15.5 L4.5 18.5 H12",
  O: "M4.5 1.5 H8.5 L11.5 4.5 V15.5 L8.5 18.5 H4.5 L1.5 15.5 V4.5 Z",
  D: "M1.5 1.5 H7.5 L11.5 5.5 V14.5 L7.5 18.5 H1.5 Z",
};

export function OgSymbol({ size, color = "#35f2c2" }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path d={SYMBOL_PATHS.hull} fill="none" stroke={color} strokeWidth={4.5} strokeLinejoin="miter" strokeLinecap="square" />
      <path d={SYMBOL_PATHS.keel} fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="square" />
      <circle cx={32} cy={29} r={7} fill="none" stroke={color} strokeWidth={1.7} strokeOpacity={0.5} />
      <circle cx={32} cy={29} r={2.9} fill={color} />
    </svg>
  );
}

export function OgWordmark({ height }: { height: number }) {
  const w = 8 * 17 - 5;
  return (
    <svg width={(height * w) / 20} height={height} viewBox={`0 0 ${w} 20`}>
      {"KEELCODE".split("").map((ch, i) => (
        <path key={i} d={GLYPHS[ch]} transform={`translate(${i * 17} 0)`} fill="none" stroke={i < 4 ? "#d7f2ea" : "#35f2c2"} strokeWidth={3} strokeLinejoin="miter" strokeLinecap="square" />
      ))}
    </svg>
  );
}
