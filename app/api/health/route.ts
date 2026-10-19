import { NextResponse } from "next/server";
import { hasApiKey, MODEL } from "@/lib/engine/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, hasApiKey: hasApiKey(), model: MODEL });
}
