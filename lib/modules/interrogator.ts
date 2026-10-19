import "server-only";
import { callText } from "@/lib/engine/llm";
import { findingsText, plan, read, type Emit } from "@/lib/engine/dispatch";
import type { RepoIndex } from "@/lib/engine/indexer";
import { KeelError, type Citation } from "@/lib/engine/types";

export interface InterrogatorResult {
  question: string;
  answer: string;
  citations: Citation[];
  invalidCitations: number;
}

const CITE = /\[\[([^\]\s:]+):(\d+)(?:-(\d+))?\]\]/g;

export function extractCitations(index: RepoIndex, text: string): Citation[] {
  const out: Citation[] = [];
  for (const m of text.matchAll(CITE)) {
    const f = index.files.get(m[1]);
    const line = Number(m[2]);
    const endLine = m[3] ? Number(m[3]) : undefined;
    out.push({ path: m[1], line, endLine, valid: !!f && line >= 1 && line <= f.lines && (!endLine || endLine <= f.lines) });
  }
  return out;
}

export async function runInterrogator(
  index: RepoIndex,
  params: { question?: string; history?: { q: string; a: string }[] },
  emit: Emit
): Promise<InterrogatorResult> {
  const question = (params.question ?? "").trim();
  if (!question) throw new KeelError("BAD_REQUEST", "Ask a question first.");
  if (question.length > 2000) throw new KeelError("BAD_REQUEST", "Question is too long (2000 chars max).");
  const history = (params.history ?? []).slice(-4);
  const convo = history.map((h) => `Q: ${h.q}\nA: ${h.a.slice(0, 1500)}`).join("\n\n");

  const task = `Answer this question about the codebase: "${question}"${convo ? `\n\nEarlier in the conversation:\n${convo}` : ""}`;
  const slices = await plan(index, task, emit, {
    maxSlices: 5,
    retrievalQuery: question,
    guidance: "For impact questions (\"what breaks if…\"), include the definition AND its importers. For \"where is X enforced\", include the enforcement point and the places that rely on it.",
  });
  const findings = await read(index, slices, task, emit, {
    instructions: "Report only facts relevant to the question, with exact line numbers. If the slice is irrelevant, say so in the summary and return no points.",
  });

  const importers = [...new Set(slices.map((s) => s.path))]
    .map((p) => `${p} is imported by: ${index.importedBy.get(p)?.join(", ") || "nothing"}`)
    .join("\n");

  emit({ type: "agent", id: "synth", role: "synthesizer", status: "start", label: "Synthesizer: writing answer" });
  let answer = "";
  answer = await callText({
    system: "You answer questions about a codebase using only the reader findings provided. Cite every factual claim inline with the exact form [[path:line]] or [[path:start-end]] using paths and lines from the findings. If the findings don't settle the question, say what is unknown rather than guessing. Use concise Markdown.",
    user: `QUESTION: ${question}\n\n${convo ? `CONVERSATION SO FAR:\n${convo}\n\n` : ""}IMPORT GRAPH FACTS:\n${importers}\n\nREADER FINDINGS:\n${findingsText(findings)}`,
    effort: "medium",
    maxTokens: 8000,
    onText: (d) => emit({ type: "delta", text: d }),
  });
  const citations = extractCitations(index, answer);
  emit({ type: "focus", paths: [...new Set(citations.filter((c) => c.valid).map((c) => c.path))] });
  emit({ type: "agent", id: "synth", role: "synthesizer", status: "done", label: `Synthesizer: ${citations.length} citations` });
  return { question, answer, citations, invalidCitations: citations.filter((c) => !c.valid).length };
}
