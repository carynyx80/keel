import "server-only";
import vm from "node:vm";
import path from "node:path/posix";
import ts from "typescript";

/**
 * Constrained executor for the Porter equivalence check.
 * - Runs JS/TS in a fresh `vm` context: no `process`, no fs/net/child_process, no Node built-ins.
 * - In-repo relative `require`/`import` are resolved against the repo snapshot (transpiled on the fly).
 * - Every call has a wall-clock timeout.
 * `vm` is NOT a hard security boundary; on Vercel the function's own micro-VM is the outer boundary.
 * Only run code from repos you trust (your own, or the bundled demo).
 */

const TIMEOUT_MS = 1000;
const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".cjs", "/index.ts", "/index.js"];

export type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

function transpile(code: string, file: string) {
  return ts.transpileModule(code, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React },
  }).outputText;
}

export class Sandbox {
  private ctx: vm.Context;
  private cache = new Map<string, { exports: unknown }>();

  constructor(private files: Map<string, string>) {
    const sandboxConsole = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
    this.ctx = vm.createContext(
      { console: sandboxConsole, Buffer, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, structuredClone },
      { codeGeneration: { strings: false, wasm: false } }
    );
  }

  private resolve(from: string, spec: string): string {
    if (!spec.startsWith(".")) throw new Error(`Module "${spec}" is not available in the sandbox (only in-repo relative imports are allowed).`);
    const base = path.normalize(path.join(path.dirname(from), spec));
    for (const e of EXTS) if (this.files.has(base + e)) return base + e;
    throw new Error(`Cannot resolve "${spec}" from ${from}`);
  }

  load(file: string): unknown {
    const hit = this.cache.get(file);
    if (hit) return hit.exports;
    const src = this.files.get(file);
    if (src === undefined) throw new Error(`No such file ${file}`);
    const code = /\.(ts|tsx|mjs)$/.test(file) || /^\s*(import|export)\s/m.test(src) ? transpile(src, file) : src;
    const mod = { exports: {} as unknown };
    this.cache.set(file, mod);
    const wrapper = vm.runInContext(`(function (exports, require, module, __filename, __dirname) {${code}\n})`, this.ctx, { filename: file, timeout: TIMEOUT_MS });
    const req = (spec: string) => this.load(this.resolve(file, spec.replace(/^node:/, "")));
    const run = () => wrapper(mod.exports, req, mod, file, path.dirname(file));
    (this.ctx as Record<string, unknown>).__keelcodeRun = run;
    vm.runInContext("__keelcodeRun()", this.ctx, { timeout: TIMEOUT_MS });
    return mod.exports;
  }

  async call(file: string, fn: string, args: unknown[]): Promise<Outcome> {
    try {
      const exp = this.load(file) as Record<string, unknown>;
      const target = fn.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], exp) ?? (fn === "default" ? exp : undefined);
      if (typeof target !== "function") return { ok: false, error: `export "${fn}" is not a function` };
      const g = this.ctx as Record<string, unknown>;
      g.__keelcodeFn = target;
      g.__keelcodeArgs = structuredClone(args);
      let value = vm.runInContext("__keelcodeFn(...__keelcodeArgs)", this.ctx, { timeout: TIMEOUT_MS });
      if (value && typeof (value as Promise<unknown>).then === "function") {
        value = await Promise.race([value, new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), TIMEOUT_MS))]);
      }
      return { ok: true, value: normalize(value) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
  }
}

/** Makes cross-context values comparable (Dates, Maps, NaN, undefined…). */
export function normalize(v: unknown, depth = 0): unknown {
  if (depth > 20) return "[deep]";
  if (v === undefined) return { $undefined: true };
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : { $number: String(v) };
  if (typeof v === "bigint") return { $bigint: v.toString() };
  if (typeof v === "function") return { $function: v.name };
  if (v === null || typeof v !== "object") return v;
  const tag = Object.prototype.toString.call(v);
  if (tag === "[object Date]") return { $date: (v as Date).toISOString?.() };
  if (tag === "[object Map]") return { $map: [...(v as Map<unknown, unknown>)].map(([k, x]) => [normalize(k, depth + 1), normalize(x, depth + 1)]) };
  if (tag === "[object Set]") return { $set: [...(v as Set<unknown>)].map((x) => normalize(x, depth + 1)) };
  if (Array.isArray(v)) return v.map((x) => normalize(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v).sort()) out[k] = normalize((v as Record<string, unknown>)[k], depth + 1);
  return out;
}

export function sameOutcome(a: Outcome, b: Outcome) {
  if (a.ok !== b.ok) return false;
  if (!a.ok) return true; // both threw: behaviour matches (messages may differ across languages)
  return JSON.stringify(a.value) === JSON.stringify((b as { value: unknown }).value);
}
