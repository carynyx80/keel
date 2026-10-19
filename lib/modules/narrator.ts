import "server-only";
import { callJSON, S } from "@/lib/engine/llm";
import { findingsText, plan, read, type Emit } from "@/lib/engine/dispatch";
import { fileTree, type RepoIndex } from "@/lib/engine/indexer";

export interface TourStep {
  n: number;
  title: string;
  path: string;
  startLine: number;
  endLine: number;
  explanation: string;
  checkpoint: { kind: "run" | "read" | "quiz"; instruction: string; command: string; answer: string };
  valid: boolean;
}

export interface NarratorResult {
  title: string;
  audience: string;
  prerequisites: string[];
  steps: TourStep[];
  markdown: string;
}

export async function runNarrator(index: RepoIndex, params: { audience?: string }, emit: Emit): Promise<NarratorResult> {
  const audience = (params.audience || "a new backend engineer on their first day").slice(0, 200);
  const scripts = [...index.files.values()]
    .filter((f) => /(^|\/)(package\.json|Makefile|pyproject\.toml|Cargo\.toml|go\.mod)$/.test(f.path))
    .map((f) => `--- ${f.path}\n${f.content.slice(0, 1500)}`)
    .join("\n");
  const task = `Design a guided onboarding tour of this codebase for ${audience}: start at the entry point, then follow one real request/data flow end to end, then the core domain logic, then tests.`;
  const slices = await plan(index, task, emit, {
    maxSlices: 7,
    retrievalQuery: "main entry start server listen handler route request model service test",
    guidance: "Pick slices that form a narrative: entry point → routing → a representative handler → domain/model logic → persistence → tests.",
  });
  const findings = await read(index, slices, task, emit, {
    instructions: "Explain what a newcomer must understand here and the exact lines that show it. Note how control flows into and out of this slice.",
  });

  emit({ type: "agent", id: "synth", role: "synthesizer", status: "start", label: "Synthesizer: sequencing the tour" });
  const out = await callJSON<Omit<NarratorResult, "steps" | "markdown"> & { steps: Omit<TourStep, "n" | "valid">[] }>({
    system: "You write onboarding tours that feel like a senior engineer walking a new hire through the code. Every step points at real lines from the findings. Checkpoints must be runnable or answerable using only this repo.",
    user: `AUDIENCE: ${audience}\nREPO: ${index.name}\n\nBUILD/RUN FILES:\n${scripts || "(none)"}\n\nFILE TREE:\n${fileTree(index, 200)}\n\nREADER FINDINGS:\n${findingsText(findings)}\n\nWrite an ordered tour of 6-10 steps ("start here → follow the request to here"). For each step: title, path, startLine, endLine (from findings), explanation (Markdown, 2-5 sentences, referencing what came before), and a checkpoint: kind "run" (command = an exact shell command from the repo's scripts, e.g. running tests), "read" (instruction = what to look for), or "quiz" (instruction = a question, answer = the answer). Use empty strings for unused checkpoint fields. Include at least two "run" checkpoints if the repo has runnable scripts.`,
    effort: "medium",
    maxTokens: 12000,
    schema: S.obj({
      title: S.str(),
      audience: S.str(),
      prerequisites: S.arr(S.str()),
      steps: S.arr(S.obj({
        title: S.str(), path: S.str(), startLine: S.int(), endLine: S.int(), explanation: S.str(),
        checkpoint: S.obj({ kind: S.enumOf(["run", "read", "quiz"]), instruction: S.str(), command: S.str(), answer: S.str() }),
      })),
    }),
  });
  const steps: TourStep[] = out.steps.map((s, i) => {
    const f = index.files.get(s.path);
    const startLine = Math.max(1, Math.min(s.startLine, f?.lines ?? s.startLine));
    const endLine = Math.max(startLine, Math.min(s.endLine, f?.lines ?? s.endLine));
    const step = { ...s, n: i + 1, startLine, endLine, valid: !!f };
    emit({ type: "partial", key: "step", value: step });
    return step;
  });
  emit({ type: "focus", paths: steps.filter((s) => s.valid).map((s) => s.path) });
  emit({ type: "agent", id: "synth", role: "synthesizer", status: "done", label: `Synthesizer: ${steps.length}-step tour` });

  const md = [
    `# ${out.title}`,
    `_For ${out.audience}_`,
    out.prerequisites.length ? `## Before you start\n${out.prerequisites.map((p) => `- ${p}`).join("\n")}` : "",
    ...steps.map((s) => {
      const cp = s.checkpoint;
      const check = cp.kind === "run" ? `**Checkpoint (run):** ${cp.instruction}\n\n\`\`\`bash\n${cp.command}\n\`\`\`` : cp.kind === "quiz" ? `**Checkpoint (quiz):** ${cp.instruction}\n\n<details><summary>Answer</summary>${cp.answer}</details>` : `**Checkpoint (read):** ${cp.instruction}`;
      return `## ${s.n}. ${s.title}\n\`${s.path}:${s.startLine}-${s.endLine}\`\n\n${s.explanation}\n\n${check}`;
    }),
  ].filter(Boolean).join("\n\n");
  return { title: out.title, audience: out.audience, prerequisites: out.prerequisites, steps, markdown: md };
}
