import "server-only";
import path from "node:path/posix";
import { callJSON, S } from "@/lib/engine/llm";
import type { Emit } from "@/lib/engine/dispatch";
import { numbered, type RepoIndex } from "@/lib/engine/indexer";
import { Sandbox, sameOutcome, type Outcome } from "@/lib/engine/sandbox";
import { lineDiff, type DiffLine } from "@/lib/engine/diff";
import { KeelcodeError } from "@/lib/engine/types";

export const PORT_TARGETS = {
  typescript: { label: "TypeScript", ext: ".ts", executable: true },
  javascript: { label: "JavaScript (ESM)", ext: ".mjs", executable: true },
  python: { label: "Python 3", ext: ".py", executable: false },
  go: { label: "Go", ext: ".go", executable: false },
  rust: { label: "Rust", ext: ".rs", executable: false },
} as const;
export type PortTarget = keyof typeof PORT_TARGETS;

interface ContractCase { fn: string; args: unknown[]; description: string }
export interface CaseResult extends ContractCase { original: Outcome | null; ported: Outcome | null; pass: boolean; note?: string }

export interface PorterResult {
  sourcePath: string;
  targetPath: string;
  target: PortTarget;
  behavior: string;
  code: string;
  notes: string;
  diff: DiffLine[];
  equivalence: {
    method: "executed" | "model-traced";
    methodNote: string;
    score: number; // 0..1
    passed: number;
    total: number;
    cases: CaseResult[];
  };
  testsUsed: string[];
}

function relatedTests(index: RepoIndex, file: string) {
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  return [...index.files.keys()].filter(
    (p) => p !== file && /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.\w+$|_test\.\w+$|test_\w+\.py$/.test(p) &&
      (p.includes(base) || index.imports.get(p)?.includes(file))
  ).slice(0, 3);
}

export async function runPorter(index: RepoIndex, params: { path?: string; target?: string }, emit: Emit): Promise<PorterResult> {
  const sourcePath = params.path ?? "";
  const file = index.files.get(sourcePath);
  if (!file) throw new KeelcodeError("BAD_REQUEST", "Pick a file to port.");
  if (file.lines > 600) throw new KeelcodeError("TOO_LARGE", "Porter handles files up to 600 lines in a single serverless run. Pick a smaller module.");
  const target = (params.target ?? "typescript") as PortTarget;
  if (!(target in PORT_TARGETS)) throw new KeelcodeError("BAD_REQUEST", "Unsupported target language.");
  const tgt = PORT_TARGETS[target];

  const tests = relatedTests(index, sourcePath);
  const deps = index.imports.get(sourcePath) ?? [];
  emit({ type: "focus", paths: [sourcePath, ...tests] });

  // 1. Contract extraction (behaviour from source + tests)
  emit({ type: "agent", id: "contract", role: "reader", status: "start", label: `Contract reader: ${sourcePath}`, paths: [sourcePath, ...tests] });
  const testText = tests.map((t) => `--- ${t}\n${numbered(index.files.get(t)!.content)}`).join("\n\n");
  const depText = deps.slice(0, 4).map((d) => `--- ${d} (dependency, for context)\n${index.files.get(d)!.content.slice(0, 3000)}`).join("\n\n");
  const contract = await callJSON<{ behavior: string; cases: { fn: string; argsJson: string; description: string }[] }>({
    system: "You recover the behavioural contract of a module from its source and tests, so that a port can be checked against it.",
    user: `SOURCE ${sourcePath} (${file.lang}):\n${numbered(file.content)}\n\nTESTS:\n${testText || "(none found)"}\n\n${depText ? `DEPENDENCIES:\n${depText}\n\n` : ""}Write:\n- behavior: a precise description of every exported function's behaviour, edge cases and error conditions.\n- cases: 8-16 contract cases calling EXPORTED functions directly with JSON-serialisable arguments (argsJson is a JSON array literal of the positional arguments). Mirror the tests, then add edge and error cases. Make every case deterministic: if a function reads the clock or randomness, pass explicit values via its parameters, and skip it if you can't.`,
    effort: "medium",
    maxTokens: 8000,
    schema: S.obj({ behavior: S.str(), cases: S.arr(S.obj({ fn: S.str(), argsJson: S.str(), description: S.str() })) }),
  });
  const cases: ContractCase[] = contract.cases.flatMap((c) => {
    try {
      const args = JSON.parse(c.argsJson);
      return [{ fn: c.fn, args: Array.isArray(args) ? args : [args], description: c.description }];
    } catch {
      return [];
    }
  }).slice(0, 16);
  emit({ type: "agent", id: "contract", role: "reader", status: "done", label: `Contract: ${cases.length} cases`, paths: [sourcePath] });
  emit({ type: "partial", key: "contract", value: { behavior: contract.behavior, cases } });

  // 2. Port
  emit({ type: "agent", id: "porter", role: "synthesizer", status: "start", label: `Porter: ${file.lang} → ${tgt.label}` });
  const ported = await callJSON<{ code: string; notes: string }>({
    system: "You are a meticulous porting engineer. You re-implement modules in another language with identical observable behaviour.",
    user: `Port this module to ${tgt.label}.\n\nSOURCE ${sourcePath}:\n${file.content}\n\nBEHAVIOURAL CONTRACT:\n${contract.behavior}\n\n${depText ? `DEPENDENCIES (for context):\n${depText}\n\n` : ""}Rules:\n- Keep the same exported function names and argument order${target === "typescript" || target === "javascript" ? ", using ES module `export` syntax. Relative imports of other repo files must keep the same relative specifiers (without changing extensions) so they resolve to the original files" : ""}.\n- Same results, same error conditions (throw/raise where the source throws), same rounding.\n- Idiomatic ${tgt.label}, self-contained, no external packages.\n- code: the full file contents only (no Markdown fences).\n- notes: short list of porting decisions and any behaviour you could not preserve exactly.`,
    effort: "medium",
    maxTokens: 16000,
    schema: S.obj({ code: S.str(), notes: S.str() }),
  });
  const code = ported.code.replace(/^```\w*\n|```\s*$/g, "");
  const targetPath = sourcePath.replace(/\.[^.\/]+$/, "") + tgt.ext;
  emit({ type: "agent", id: "porter", role: "synthesizer", status: "done", label: `Porter: wrote ${targetPath}` });
  emit({ type: "partial", key: "code", value: { code, targetPath } });

  // 3. Equivalence
  const sourceExecutable = /Script$/.test(file.lang);
  const results: CaseResult[] = [];
  let method: PorterResult["equivalence"]["method"] = "executed";
  let methodNote = "";

  let originals: Outcome[] | null = null;
  if (sourceExecutable) {
    emit({ type: "agent", id: "runner", role: "verifier", status: "start", label: "Runner: executing original against contract" });
    const snapshot = new Map([...index.files].map(([p, f]) => [p, f.content]));
    const sb = new Sandbox(snapshot);
    originals = [];
    for (const c of cases) originals.push(await sb.call(sourcePath, c.fn, c.args));
    const loadFailed = originals.every((o) => !o.ok && /not available in the sandbox|Cannot resolve/.test(o.error));
    if (loadFailed) {
      methodNote = `Original module couldn't run in the sandbox (${(originals[0] as { error: string }).error}). `;
      originals = null;
    }
    emit({ type: "agent", id: "runner", role: "verifier", status: "done", label: originals ? "Runner: original executed" : "Runner: original not executable" });
  }

  if (originals && tgt.executable) {
    emit({ type: "agent", id: "runner2", role: "verifier", status: "start", label: "Runner: executing port against contract" });
    const snapshot = new Map([...index.files].map(([p, f]) => [p, f.content]));
    snapshot.set(targetPath, code);
    const sb = new Sandbox(snapshot);
    for (let i = 0; i < cases.length; i++) {
      const p = await sb.call(targetPath, cases[i].fn, cases[i].args);
      const r: CaseResult = { ...cases[i], original: originals[i], ported: p, pass: sameOutcome(originals[i], p) };
      results.push(r);
      emit({ type: "partial", key: "case", value: r });
    }
    methodNote += "Both implementations were executed in a constrained VM (no fs/network/built-ins, 1s timeout per call) on identical inputs; outputs were compared structurally. Thrown errors match if both sides throw.";
    emit({ type: "agent", id: "runner2", role: "verifier", status: "done", label: `Runner: ${results.filter((r) => r.pass).length}/${results.length} cases match` });
  } else {
    method = "model-traced";
    methodNote += `${tgt.label} can't be executed inside a Vercel Node function, so a verifier agent traced the port by hand against ${originals ? "the original's EXECUTED outputs" : "the contract"}. This is a review, not a test run — treat the score as an estimate.`;
    emit({ type: "agent", id: "verifier", role: "verifier", status: "start", label: "Verifier: tracing port against contract" });
    const traced = await callJSON<{ cases: { index: number; predicted: string; matches: boolean; note: string }[] }>({
      system: "You are a strict verifier. For each case, trace the PORTED code by hand and predict its result, then compare with the expected result. Be skeptical: rounding, integer division, error types, and missing branches are common porting bugs.",
      user: `PORTED CODE (${tgt.label}):\n${numbered(code)}\n\nCASES:\n${cases.map((c, i) => `#${i} ${c.fn}(${c.args.map((a) => JSON.stringify(a)).join(", ")}) — ${c.description}\n   expected: ${originals ? JSON.stringify(originals[i]) : "(per contract)"}`).join("\n")}\n\nCONTRACT:\n${contract.behavior}`,
      effort: "medium",
      maxTokens: 8000,
      schema: S.obj({ cases: S.arr(S.obj({ index: S.int(), predicted: S.str(), matches: S.bool(), note: S.str() })) }),
    });
    cases.forEach((c, i) => {
      const t = traced.cases.find((x) => x.index === i);
      const r: CaseResult = { ...c, original: originals?.[i] ?? null, ported: t ? { ok: true, value: `(traced) ${t.predicted}` } : null, pass: !!t?.matches, note: t?.note };
      results.push(r);
      emit({ type: "partial", key: "case", value: r });
    });
    emit({ type: "agent", id: "verifier", role: "verifier", status: "done", label: `Verifier: ${results.filter((r) => r.pass).length}/${results.length} traced as matching` });
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    sourcePath,
    targetPath,
    target,
    behavior: contract.behavior,
    code,
    notes: ported.notes,
    diff: lineDiff(file.content, code),
    equivalence: { method, methodNote, score: results.length ? passed / results.length : 0, passed, total: results.length, cases: results },
    testsUsed: tests,
  };
}
