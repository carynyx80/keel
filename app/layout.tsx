import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const hud = Chakra_Petch({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-hud" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  applicationName: "Keelcode",
  title: { default: "Keelcode — dive into any codebase", template: "%s · Keelcode" },
  openGraph: { siteName: "Keelcode", type: "website" },
  twitter: { card: "summary_large_image" },
  description: "Dive into a codebase. A crew of AI agents maps its hull, answers with citations, ports modules, recovers specs and charts onboarding tours.",
  other: { "ory-verify": "orynth-cbb7d6af7361489f85001ad84d084ff2" },
};
export const viewport: Viewport = { themeColor: "#02060a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hud.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
