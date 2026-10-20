import { getIndex } from "@/lib/engine/indexer";
import { parseSource, sseResponse } from "@/lib/engine/stream";
import { KeelcodeError, type ModuleId } from "@/lib/engine/types";
import { runCartograph } from "@/lib/modules/cartograph";
import { runInterrogator } from "@/lib/modules/interrogator";
import { runPorter } from "@/lib/modules/porter";
import { runSpec } from "@/lib/modules/spec";
import { runNarrator } from "@/lib/modules/narrator";
import { hasApiKey, NO_KEY_MESSAGE } from "@/lib/engine/llm";

export const runtime = "nodejs";
// Multi-agent jobs take 1–4 minutes. Requires Vercel Fluid Compute (default for new projects).
export const maxDuration = 300;

const MODULES: ModuleId[] = ["cartograph", "interrogator", "porter", "spec", "narrator"];

export async function POST(req: Request, ctx: { params: Promise<{ module: string }> }) {
  const { module } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { params?: Record<string, unknown> } | null;
  return sseResponse(async (emit) => {
    if (!MODULES.includes(module as ModuleId)) throw new KeelcodeError("NOT_FOUND", `Unknown module "${module}"`, 404);
    const source = parseSource(body);
    if (!hasApiKey()) throw new KeelcodeError("NO_API_KEY", NO_KEY_MESSAGE, 503);
    const { index, cached } = await getIndex(source, (m) => emit({ type: "progress", stage: "ingest", message: m }));
    if (!cached) {
      emit({ type: "summary", summary: index.summary });
      emit({ type: "graph", graph: index.graph });
    }
    emit({ type: "progress", stage: "dispatch", message: `Dispatching agents for ${module}…` });
    const p = (body?.params ?? {}) as Record<string, string>;
    const id = module as ModuleId;
    const data =
      id === "cartograph" ? await runCartograph(index, emit)
      : id === "interrogator" ? await runInterrogator(index, p as never, emit)
      : id === "porter" ? await runPorter(index, p, emit)
      : id === "spec" ? await runSpec(index, emit)
      : await runNarrator(index, p, emit);
    emit({ type: "result", module: id, data });
  });
}
