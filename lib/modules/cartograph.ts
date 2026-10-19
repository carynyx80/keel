import "server-only";
import { callJSON, S } from "@/lib/engine/llm";
import { findingsText, plan, read, type Emit } from "@/lib/engine/dispatch";
import { fileTree, isCode, moduleOf, type RepoIndex } from "@/lib/engine/indexer";

export interface CartographResult {
  overview: string;
  modules: { name: string; responsibility: string; publicSurface: string[]; internals: string[]; dependsOn: string[] }[];
  architectureMermaid: string;
  computedMermaid: string;
  readme: string;
  stats: { files: number; lines: number; internalEdges: number; externalPackages: string[] };
}

/** Deterministic module-level dependency diagram straight from the import graph (no model involved). */
export function computedModuleMermaid(index: RepoIndex) {
  const edges = new Map<string, number>();
  for (const [src, targets] of index.imports)
    for (const t of targets) {
      const a = moduleOf(src), b = moduleOf(t);
      if (a !== b) edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
    }
  const mods = [...new Set([...index.files.values()].filter(isCode).map((f) => moduleOf(f.path)))];
  const id = (m: string) => "m_" + m.replace(/[^\w]/g, "_");
  const lines = ["flowchart LR"];
  for (const m of mods) lines.push(`  ${id(m)}["${m}"]`);
  for (const [k, n] of edges) {
    const [a, b] = k.split("|");
    lines.push(`  ${id(a)} -->|${n}| ${id(b)}`);
  }
  return lines.join("\n");
}

export async function runCartograph(index: RepoIndex, emit: Emit): Promise<CartographResult> {
  const computedMermaid = computedModuleMermaid(index);
  const externalPackages = [...new Set([...index.externalDeps.values()].flat())].sort().slice(0, 60);
  const stats = {
    files: index.summary.fileCount,
    lines: index.summary.totalLines,
    internalEdges: [...index.imports.values()].reduce((n, t) => n + t.length, 0),
    externalPackages,
  };
  emit({ type: "partial", key: "computed", value: { computedMermaid, stats } });

  const task = "Recover the architecture of this repository: entry points, module boundaries, what each module is responsible for, its public surface vs. internals, and how requests/data flow between modules.";
  // Pin the most-connected files so hubs are always read.
  const hubs = [...index.files.values()]
    .filter(isCode)
    .map((f) => ({ f, d: (index.imports.get(f.path)?.length ?? 0) + (index.importedBy.get(f.path)?.length ?? 0) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 2)
    .map(({ f }) => ({ path: f.path, startLine: 1, endLine: f.lines, focus: "Hub file: how it wires the rest of the system together." }));

  const slices = await plan(index, task, emit, {
    maxSlices: 8,
    pinned: hubs,
    retrievalQuery: "main entry server app router index export module public api",
    guidance: "Cover every top-level module at least once. Prefer entry points, routers, and index/barrel files.",
  });
  const findings = await read(index, slices, task, emit, {
    instructions: "Identify: which functions/classes are exported and used elsewhere (public surface) vs. only used internally; what this file depends on; its responsibility in one line.",
  });

  emit({ type: "agent", id: "synth", role: "synthesizer", status: "start", label: "Synthesizer: drafting architecture + README" });
  const moduleList = [...new Set([...index.files.values()].map((f) => moduleOf(f.path)))].join(", ");
  const out = await callJSON<Omit<CartographResult, "computedMermaid" | "stats">>({
    system: "You are the synthesizer in a code-comprehension team. You merge reader findings into an accurate architecture map. Only state what the findings or file tree support. Cite files as `path:line` where useful.",
    user: `REPO: ${index.name}\nMODULES (by directory): ${moduleList}\nEXTERNAL PACKAGES: ${externalPackages.join(", ") || "none"}\n\nFILE TREE:\n${fileTree(index, 250)}\n\nCOMPUTED MODULE DEPENDENCIES (mermaid, ground truth from imports):\n${computedMermaid}\n\nREADER FINDINGS:\n${findingsText(findings)}\n\nProduce:\n- overview: 1 paragraph.\n- modules: one entry per meaningful module (use the directory module names above), with publicSurface (exported symbols other modules use) and internals.\n- architectureMermaid: a Mermaid flowchart (\"flowchart TD\") of the runtime architecture/request flow. Use simple alphanumeric node ids and quoted labels; no HTML, no parentheses inside unquoted labels.\n- readme: a complete README.md for the repo (what it is, architecture, module guide, how to run/test based on package scripts you saw, and key concepts). Markdown.`,
    effort: "medium",
    maxTokens: 16000,
    schema: S.obj({
      overview: S.str(),
      modules: S.arr(S.obj({ name: S.str(), responsibility: S.str(), publicSurface: S.arr(S.str()), internals: S.arr(S.str()), dependsOn: S.arr(S.str()) })),
      architectureMermaid: S.str(),
      readme: S.str(),
    }),
  });
  emit({ type: "agent", id: "synth", role: "synthesizer", status: "done", label: "Synthesizer: architecture ready" });
  return { ...out, architectureMermaid: out.architectureMermaid.replace(/^```(mermaid)?\s*|```\s*$/g, ""), computedMermaid, stats };
}
