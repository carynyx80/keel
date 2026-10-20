import "server-only";
import { callJSON, S } from "./llm";
import { fileTree, numbered, type RepoIndex } from "./indexer";
import type { Finding, KeelcodeEvent } from "./types";

export type Emit = (e: KeelcodeEvent) => void;

export interface Slice {
  path: string;
  startLine: number;
  endLine: number;
  focus: string;
}

const MAX_SLICE_LINES = 260;

/** Runs async tasks with bounded concurrency, preserving result order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function clampSlice(index: RepoIndex, s: Slice): Slice | null {
  const f = index.files.get(s.path);
  if (!f) return null;
  let start = Math.max(1, Math.min(s.startLine || 1, f.lines));
  let end = Math.max(start, Math.min(s.endLine || f.lines, f.lines));
  if (end - start + 1 > MAX_SLICE_LINES) end = start + MAX_SLICE_LINES - 1;
  return { path: s.path, startLine: start, endLine: end, focus: s.focus };
}

/** Planner agent: decides which slices of the repo are relevant to the task. */
export async function plan(
  index: RepoIndex,
  task: string,
  emit: Emit,
  opts: { maxSlices?: number; guidance?: string; retrievalQuery?: string; pinned?: Slice[] } = {}
): Promise<Slice[]> {
  const maxSlices = opts.maxSlices ?? 6;
  const hits = index.store.search(opts.retrievalQuery ?? task, 24);
  emit({ type: "agent", id: "planner", role: "planner", status: "start", label: "Planner: choosing slices", paths: [...new Set(hits.map((h) => h.chunk.path))].slice(0, 12) });

  const deps = [...index.imports.entries()].filter(([, t]) => t.length).slice(0, 300).map(([s, t]) => `${s} -> ${t.join(", ")}`).join("\n");
  const user = `TASK:\n${task}\n\n${opts.guidance ? `GUIDANCE:\n${opts.guidance}\n\n` : ""}REPOSITORY "${index.name}" FILE TREE:\n${fileTree(index)}\n\nINTERNAL IMPORTS (file -> imports):\n${deps || "(none detected)"}\n\nRETRIEVAL HITS for the task (path:lines, score):\n${hits.map((h) => `${h.chunk.path}:${h.chunk.startLine}-${h.chunk.endLine} (${h.score.toFixed(2)})`).join("\n")}\n\nChoose up to ${maxSlices} slices (file + line range, at most ${MAX_SLICE_LINES} lines each) that reader agents should study. Prefer whole small files; split large files into the relevant ranges. Each slice gets a one-sentence focus telling the reader what to look for.`;

  type Out = { reasoning: string; slices: Slice[] };
  let out: Out;
  try {
    out = await callJSON<Out>({
      system: "You are the planner in a team of code-reading agents. You never see full file contents; you pick which slices other agents will read. Be economical and precise.",
      user,
      effort: "low",
      maxTokens: 6000,
      schema: S.obj({
        reasoning: S.str("one or two sentences"),
        slices: S.arr(S.obj({ path: S.str(), startLine: S.int(), endLine: S.int(), focus: S.str() })),
      }),
    });
  } catch (e) {
    emit({ type: "agent", id: "planner", role: "planner", status: "error", label: "Planner failed", detail: (e as Error).message });
    throw e;
  }

  const seen = new Set<string>();
  const slices: Slice[] = [];
  for (const s of [...(opts.pinned ?? []), ...out.slices]) {
    const c = clampSlice(index, s);
    if (!c) continue;
    const k = `${c.path}:${c.startLine}`;
    if (seen.has(k)) continue;
    seen.add(k);
    slices.push(c);
    if (slices.length >= maxSlices) break;
  }
  if (slices.length === 0) {
    for (const h of hits.slice(0, maxSlices)) slices.push({ path: h.chunk.path, startLine: h.chunk.startLine, endLine: h.chunk.endLine, focus: task });
  }
  emit({ type: "agent", id: "planner", role: "planner", status: "done", label: `Planner: ${slices.length} slices`, paths: slices.map((s) => s.path), detail: out.reasoning });
  return slices;
}

/** Reader agents: each studies one slice and returns findings with file/line references. */
export async function read(
  index: RepoIndex,
  slices: Slice[],
  task: string,
  emit: Emit,
  opts: { instructions?: string; concurrency?: number } = {}
): Promise<Finding[]> {
  const results = await pool(slices, opts.concurrency ?? 4, async (s, i) => {
    const id = `reader-${i + 1}`;
    const sliceName = `${s.path}:${s.startLine}-${s.endLine}`;
    emit({ type: "agent", id, role: "reader", status: "start", label: `Reader ${i + 1}: ${sliceName}`, paths: [s.path] });
    emit({ type: "focus", paths: [s.path] });
    const f = index.files.get(s.path)!;
    const ctx = [
      index.imports.get(s.path)?.length ? `This file imports: ${index.imports.get(s.path)!.join(", ")}` : "",
      index.importedBy.get(s.path)?.length ? `Imported by: ${index.importedBy.get(s.path)!.join(", ")}` : "",
      index.externalDeps.get(s.path)?.length ? `External packages: ${index.externalDeps.get(s.path)!.join(", ")}` : "",
    ].filter(Boolean).join("\n");
    try {
      const out = await callJSON<{ summary: string; points: Finding["points"] }>({
        system: "You are a reader agent. You study one slice of a codebase and report precise, verifiable findings. Every point must cite the exact line numbers shown in the left gutter. Never invent code that isn't in the slice.",
        user: `OVERALL TASK:\n${task}\n\nYOUR FOCUS:\n${s.focus}\n\n${opts.instructions ? `INSTRUCTIONS:\n${opts.instructions}\n\n` : ""}FILE: ${s.path} (${f.lang}, ${f.lines} lines total; showing ${s.startLine}-${s.endLine})\n${ctx}\n\n${numbered(f.content, s.startLine, s.endLine)}`,
        effort: "low",
        maxTokens: 6000,
        schema: S.obj({
          summary: S.str("2-4 sentences on what this slice does relative to the task"),
          points: S.arr(S.obj({ claim: S.str(), path: S.str(), line: S.int(), endLine: S.int() })),
        }),
      });
      const points = out.points
        .map((p) => ({ ...p, path: index.files.has(p.path) ? p.path : s.path }))
        .map((p) => {
          const max = index.files.get(p.path)!.lines;
          const line = Math.max(1, Math.min(p.line, max));
          return { ...p, line, endLine: Math.max(line, Math.min(p.endLine || line, max)) };
        });
      const finding: Finding = { agent: id, slice: sliceName, summary: out.summary, points };
      emit({ type: "finding", finding });
      emit({ type: "agent", id, role: "reader", status: "done", label: `Reader ${i + 1}: ${points.length} findings`, paths: [s.path] });
      return finding;
    } catch (e) {
      emit({ type: "agent", id, role: "reader", status: "error", label: `Reader ${i + 1} failed`, detail: (e as Error).message, paths: [s.path] });
      if ((e as { code?: string }).code === "NO_API_KEY" || (e as { code?: string }).code === "BAD_API_KEY") throw e;
      return null;
    }
  });
  const ok = results.filter((r): r is Finding => !!r);
  if (ok.length === 0 && slices.length > 0) throw new Error("All reader agents failed — see the activity log.");
  return ok;
}

export function findingsText(findings: Finding[]) {
  return findings
    .map((f) => `### ${f.agent} — ${f.slice}\n${f.summary}\n${f.points.map((p) => `- [${p.path}:${p.line}${p.endLine > p.line ? `-${p.endLine}` : ""}] ${p.claim}`).join("\n")}`)
    .join("\n\n");
}
