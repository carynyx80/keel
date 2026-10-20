import { NextResponse } from "next/server";
import { getIndex } from "@/lib/engine/indexer";
import { parseSource } from "@/lib/engine/stream";
import { KeelcodeError } from "@/lib/engine/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const source = parseSource(body);
    const { index } = await getIndex(source, () => {});
    const f = index.files.get(String(body.path));
    if (!f) return NextResponse.json({ error: "File not found in index" }, { status: 404 });
    return NextResponse.json({ path: f.path, lang: f.lang, content: f.content, imports: index.imports.get(f.path) ?? [], importedBy: index.importedBy.get(f.path) ?? [] });
  } catch (e) {
    const status = e instanceof KeelcodeError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
