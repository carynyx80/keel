import { ImageResponse } from "next/og";
import { OgSymbol } from "@/components/brand/OgSymbol";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 40%, #0b2a2a 0%, #02060a 75%)" }}>
        <OgSymbol size={128} />
      </div>
    ),
    size
  );
}
