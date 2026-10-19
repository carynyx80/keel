import { getIndex } from "@/lib/engine/indexer";
import { parseSource, sseResponse } from "@/lib/engine/stream";
import { hasApiKey, MODEL } from "@/lib/engine/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return sseResponse(async (emit) => {
    const source = parseSource(body);
    emit({ type: "progress", stage: "ingest", message: "Starting ingest…" });
    const { index, cached } = await getIndex(source, (m) => emit({ type: "progress", stage: "ingest", message: m }));
    emit({ type: "summary", summary: index.summary });
    emit({ type: "graph", graph: index.graph });
    emit({
      type: "result",
      module: "ingest",
      data: {
        cached,
        hasApiKey: hasApiKey(),
        model: MODEL,
        files: [...index.files.values()].map((f) => ({ path: f.path, lines: f.lines, lang: f.lang })),
      },
    });
  });
}
