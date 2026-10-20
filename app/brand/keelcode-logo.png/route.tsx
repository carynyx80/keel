import { ImageResponse } from "next/og";
import { OgSymbol, OgWordmark } from "@/components/brand/OgSymbol";

export const dynamic = "force-static";

/** 2400×800 PNG of the horizontal logo on the brand background. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 70, background: "radial-gradient(circle at 30% 45%, #0b2d2a 0%, #02060a 70%)" }}>
        <OgSymbol size={400} />
        <OgWordmark height={250} />
      </div>
    ),
    { width: 2400, height: 800 }
  );
}
