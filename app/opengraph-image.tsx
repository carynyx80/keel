import { ImageResponse } from "next/og";
import { OgSymbol, OgWordmark } from "@/components/brand/OgSymbol";

export const alt = "Keelcode: dive into any codebase";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  const grid = "linear-gradient(rgba(53,242,194,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(53,242,194,0.07) 1px, transparent 1px)";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#02060a", backgroundImage: `radial-gradient(circle at 75% 35%, rgba(53,242,194,0.16), transparent 55%), ${grid}`, backgroundSize: "100% 100%, 48px 48px, 48px 48px", color: "#d7f2ea" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <OgSymbol size={112} />
          <OgWordmark height={58} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: 2, lineHeight: 1.05, display: "flex", flexDirection: "column" }}>
            <span>DIVE INTO</span>
            <span style={{ color: "#35f2c2" }}>ANY CODEBASE</span>
          </div>
          <div style={{ fontSize: 28, color: "#86a8a0", maxWidth: 900 }}>
            A crew of AI agents maps the hull, answers with citations, ports modules, salvages specs and charts a guided dive.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 6, color: "#35f2c2" }}>SUBSURFACE CODE RECON · KEELCODE.XYZ</div>
      </div>
    ),
    size
  );
}
