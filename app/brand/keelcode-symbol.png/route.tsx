import { ImageResponse } from "next/og";
import { OgSymbol } from "@/components/brand/OgSymbol";

export const dynamic = "force-static";

/** 1024×1024 PNG app-icon tile of the symbol. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#02060a" }}>
        <div style={{ width: 1024, height: 1024, borderRadius: 230, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 30%, #0e3b36 0%, #02060a 80%)" }}>
          <OgSymbol size={740} />
        </div>
      </div>
    ),
    { width: 1024, height: 1024 }
  );
}
