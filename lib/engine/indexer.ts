import "server-only";
import path from "node:path/posix";
import { HashedTfIdfStore, type VectorStore } from "./vector";
import { ingest, sourceKey, type RawRepo } from "./ingest";
import type { Chunk, GraphEdge, GraphNode, RepoFile, RepoGraph, RepoSource, RepoSummary, SymbolDef } from "./types";

export interface RepoIndex {
  repoId: string;
  name: string;
  files: Map<string, RepoFile>;
  imports: Map<string, string[]>; // resolved, in-repo only
  importedBy: Map<string, string[]>;
  externalDeps: Map<string, string[]>;
  symbols: SymbolDef[];
  chunks: Chunk[];
  store: VectorStore;
  graph: RepoGraph;
  summary: RepoSummary;
  builtAt: number;
}

const LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rb: "Ruby", java: "Java", kt: "Kotlin", rs: "Rust", php: "PHP", cs: "C#", c: "C", h: "C",
  cpp: "C++", hpp: "C++", swift: "Swift", scala: "Scala", sql: "SQL", graphql: "GraphQL", proto: "Protobuf",
  yml: "YAML", yaml: "YAML", json: "JSON", toml: "TOML", md: "Markdown", sh: "Shell", html: "HTML", css: "CSS",
  scss: "CSS", vue: "Vue", svelte: "Svelte", ex: "Elixir", exs: "Elixir", lua: "Lua", dart: "Dart", tf: "Terraform",
};

export function langOf(p: string) {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return LANG[ext] ?? "Other";
}

export const isCode = (f: RepoFile) => !["Markdown", "JSON", "YAML", "TOML", "Other", "CSS", "HTML"].includes(f.lang);

// ---------- import extraction ----------
function rawImports(f: RepoFile): string[] {
  const s = f.content;
  const out: string[] = [];
  const push = (re: RegExp) => {
    for (const m of s.matchAll(re)) out.push(m[1]);
  };
  if (/Script$/.test(f.lang) || ["Vue", "Svelte"].includes(f.lang)) {
    push(/\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g);
    push(/\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g);
    push(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g);
    push(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g);
  } else if (f.lang === "Python") {
    push(/^\s*from\s+([.\w]+)\s+import/gm);
    push(/^\s*import\s+([\w.]+)/gm);
  } else if (f.lang === "Go") {
    for (const m of s.matchAll(/import\s*\(([\s\S]*?)\)/g)) for (const q of m[1].matchAll(/"([^"]+)"/g)) out.push(q[1]);
    push(/import\s+(?:\w+\s+)?"([^"]+)"/g);
  } else if (f.lang === "Ruby") {
    push(/require_relative\s+['"]([^'"]+)['"]/g);
  } else if (["Java", "Kotlin", "Scala"].includes(f.lang)) {
    push(/^\s*import\s+(?:static\s+)?([\w.]+)/gm);
  } else if (f.lang === "Rust") {
    push(/^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm);
    push(/^\s*use\s+crate::([\w:]+)/gm);
  }
  return out;
}

function resolveImport(from: string, spec: string, files: Map<string, RepoFile>, lang: string): string | null {
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", ".py", "/__init__.py", ".rb", ".rs", "/mod.rs"];
  const tryPaths = (base: string) => {
    for (const e of exts) if (files.has(base + e)) return base + e;
    return null;
  };
  const dir = path.dirname(from);
  if (/Script$/.test(lang) || lang === "Vue" || lang === "Svelte") {
    if (spec.startsWith(".")) return tryPaths(path.normalize(path.join(dir, spec)));
    if (spec.startsWith("@/") || spec.startsWith("~/")) return tryPaths(spec.slice(2)) ?? tryPaths("src/" + spec.slice(2));
    return null;
  }
  if (lang === "Python") {
    if (spec.startsWith(".")) {
      const dots = spec.match(/^\.+/)![0].length;
      let base = dir;
      for (let i = 1; i < dots; i++) base = path.dirname(base);
      return tryPaths(path.join(base, spec.slice(dots).replace(/\./g, "/")));
    }
    const p = spec.replace(/\./g, "/");
    return tryPaths(p) ?? tryPaths("src/" + p);
  }
  if (lang === "Ruby") return tryPaths(path.normalize(path.join(dir, spec)));
  if (lang === "Rust") {
    const p = spec.split("::")[0];
    return tryPaths(path.join(dir, p)) ?? tryPaths("src/" + p);
  }
  if (lang === "Go") {
    // Match the import path suffix to a directory in the repo, then pick its first file.
    for (const f of files.keys()) if (f.endsWith(".go") && path.dirname(f) !== "." && spec.endsWith(path.dirname(f))) return f;
    return null;
  }
  if (["Java", "Kotlin", "Scala"].includes(lang)) {
    const tail = spec.replace(/\./g, "/");
    for (const f of files.keys()) if (f.replace(/\.(java|kt|scala)$/, "").endsWith(tail)) return f;
  }
  return null;
}

// ---------- symbols ----------
function extractSymbols(f: RepoFile): SymbolDef[] {
  const out: SymbolDef[] = [];
  const lines = f.content.split("\n");
  const add = (name: string, kind: SymbolDef["kind"], line: number, exported: boolean) => out.push({ name, kind, path: f.path, line, exported });
  const jsExports = new Set<string>();
  if (/Script$/.test(f.lang)) {
    const me = f.content.match(/module\.exports\s*=\s*\{([^}]*)\}/);
    if (me) for (const n of me[1].split(",")) jsExports.add(n.split(":")[0].trim());
  }
  lines.forEach((l, i) => {
    const n = i + 1;
    let m: RegExpMatchArray | null;
    if (/Script$/.test(f.lang)) {
      if ((m = l.match(/^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+(\w+)/))) add(m[2], "function", n, !!m[1] || jsExports.has(m[2]));
      else if ((m = l.match(/^\s*(export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/))) add(m[2], "class", n, !!m[1] || jsExports.has(m[2]));
      else if ((m = l.match(/^\s*(export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/))) add(m[2], "function", n, !!m[1] || jsExports.has(m[2]));
      else if ((m = l.match(/^\s*(export\s+)?(?:interface|type)\s+(\w+)/))) add(m[2], "type", n, !!m[1]);
      else if ((m = l.match(/^\s*(export\s+)?const\s+([A-Z][A-Za-z0-9_]+)\s*=/))) add(m[2], "const", n, !!m[1] || jsExports.has(m[2]));
      if ((m = l.match(/\b(?:router|app|server)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/i))) add(`${m[1].toUpperCase()} ${m[2]}`, "route", n, true);
    } else if (f.lang === "Python") {
      if ((m = l.match(/^(\s*)(?:async\s+)?def\s+(\w+)/))) add(m[2], "function", n, m[1] === "" && !m[2].startsWith("_"));
      else if ((m = l.match(/^(\s*)class\s+(\w+)/))) add(m[2], "class", n, m[1] === "" && !m[2].startsWith("_"));
      if ((m = l.match(/@\w+\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]/))) add(`${m[1].toUpperCase()} ${m[2]}`, "route", n, true);
    } else if (f.lang === "Go") {
      if ((m = l.match(/^func\s+(?:\([^)]*\)\s*)?(\w+)/))) add(m[1], "function", n, /^[A-Z]/.test(m[1]));
      else if ((m = l.match(/^type\s+(\w+)\s+(struct|interface)/))) add(m[1], m[2] === "struct" ? "class" : "type", n, /^[A-Z]/.test(m[1]));
    } else if (["Java", "Kotlin", "C#", "Scala", "Swift", "PHP", "Ruby", "Rust"].includes(f.lang)) {
      if ((m = l.match(/\b(?:class|interface|struct|enum|trait|object)\s+(\w+)/))) add(m[1], "class", n, !/private/.test(l));
      else if ((m = l.match(/\b(?:fn|func|def|fun|function)\s+(\w+)/))) add(m[1], "function", n, !/private|^\s*fn\s/.test(l) || /pub\s/.test(l));
    }
  });
  return out;
}

function complexityOf(content: string) {
  return (content.match(/\b(if|for|while|case|catch|elif|switch|&&|\|\|)\b|\?[^.?]/g) ?? []).length;
}

// ---------- chunking ----------
const CHUNK_LINES = 60;
const OVERLAP = 10;
function chunkFile(f: RepoFile): Chunk[] {
  const lines = f.content.split("\n");
  const out: Chunk[] = [];
  for (let start = 0; start < lines.length; start += CHUNK_LINES - OVERLAP) {
    const end = Math.min(lines.length, start + CHUNK_LINES);
    out.push({ id: `${f.path}#${start + 1}`, path: f.path, startLine: start + 1, endLine: end, text: lines.slice(start, end).join("\n") });
    if (end === lines.length) break;
  }
  return out;
}

// ---------- module assignment & graph ----------
export function moduleOf(p: string): string {
  const parts = p.split("/");
  if (parts.length === 1) return "(root)";
  const containers = new Set(["src", "lib", "app", "pkg", "internal", "packages", "apps", "cmd", "source"]);
  if (containers.has(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

const MAX_NODES = 220; // level-of-detail cap for the 3D scene

function buildGraph(files: Map<string, RepoFile>, imports: Map<string, string[]>, importedBy: Map<string, string[]>): RepoGraph {
  const fileNodes: GraphNode[] = [...files.values()]
    .filter((f) => isCode(f) || imports.get(f.path)?.length || importedBy.get(f.path)?.length)
    .map((f) => ({
      id: f.path,
      label: path.basename(f.path),
      module: moduleOf(f.path),
      kind: "file" as const,
      lines: f.lines,
      complexity: complexityOf(f.content),
      degree: (imports.get(f.path)?.length ?? 0) + (importedBy.get(f.path)?.length ?? 0),
    }));
  const edges: GraphEdge[] = [];
  for (const [src, targets] of imports) for (const t of targets) edges.push({ source: src, target: t, weight: 1 });
  const modules = [...new Set(fileNodes.map((n) => n.module))].sort();

  if (fileNodes.length <= MAX_NODES) {
    const ids = new Set(fileNodes.map((n) => n.id));
    return { nodes: fileNodes, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)), modules, aggregated: false, totalFiles: files.size };
  }

  // LOD: keep the most connected files individually, collapse the rest into directory nodes.
  const keepN = Math.floor(MAX_NODES * 0.6);
  const kept = new Set([...fileNodes].sort((a, b) => b.degree - a.degree || b.lines - a.lines).slice(0, keepN).map((n) => n.id));
  const groupOf = (id: string) => (kept.has(id) ? id : path.dirname(id) + "/");
  const groups = new Map<string, GraphNode>();
  for (const n of fileNodes) {
    if (kept.has(n.id)) continue;
    const g = groupOf(n.id);
    const cur = groups.get(g) ?? { id: g, label: g, module: n.module, kind: "group" as const, lines: 0, complexity: 0, degree: 0, files: 0 };
    cur.lines += n.lines;
    cur.complexity += n.complexity;
    cur.files! += 1;
    groups.set(g, cur);
  }
  let groupNodes = [...groups.values()].sort((a, b) => b.lines - a.lines);
  if (groupNodes.length + keepN > MAX_NODES) {
    // Still too many: collapse groups to their module.
    const byMod = new Map<string, GraphNode>();
    for (const g of groupNodes) {
      const id = g.module + "/*";
      const cur = byMod.get(id) ?? { id, label: id, module: g.module, kind: "group" as const, lines: 0, complexity: 0, degree: 0, files: 0 };
      cur.lines += g.lines;
      cur.complexity += g.complexity;
      cur.files! += g.files!;
      byMod.set(id, cur);
    }
    const remap = new Map(groupNodes.map((g) => [g.id, g.module + "/*"]));
    groupNodes = [...byMod.values()];
    const old = groupOf;
    const groupOf2 = (id: string) => (kept.has(id) ? id : remap.get(old(id)) ?? old(id));
    return finish(groupOf2);
  }
  return finish(groupOf);

  function finish(map: (id: string) => string): RepoGraph {
    const agg = new Map<string, GraphEdge>();
    for (const e of edges) {
      const s = map(e.source), t = map(e.target);
      if (s === t) continue;
      const k = s + "→" + t;
      const cur = agg.get(k);
      if (cur) cur.weight++;
      else agg.set(k, { source: s, target: t, weight: 1 });
    }
    const nodes = [...fileNodes.filter((n) => kept.has(n.id)), ...groupNodes];
    const ids = new Set(nodes.map((n) => n.id));
    const outEdges = [...agg.values()].filter((e) => ids.has(e.source) && ids.has(e.target));
    for (const n of nodes) n.degree = outEdges.filter((e) => e.source === n.id || e.target === n.id).length;
    return { nodes, edges: outEdges, modules, aggregated: true, totalFiles: files.size };
  }
}

export function buildIndex(raw: RawRepo): RepoIndex {
  const files = new Map<string, RepoFile>();
  for (const [p, content] of raw.files)
    files.set(p, { path: p, content, lang: langOf(p), lines: content.split("\n").length, bytes: content.length });

  const imports = new Map<string, string[]>();
  const importedBy = new Map<string, string[]>();
  const externalDeps = new Map<string, string[]>();
  for (const f of files.values()) {
    const resolved = new Set<string>();
    const ext = new Set<string>();
    for (const spec of rawImports(f)) {
      const r = resolveImport(f.path, spec, files, f.lang);
      if (r && r !== f.path) resolved.add(r);
      else if (!spec.startsWith(".")) ext.add(spec);
    }
    imports.set(f.path, [...resolved]);
    externalDeps.set(f.path, [...ext]);
    for (const r of resolved) importedBy.set(r, [...(importedBy.get(r) ?? []), f.path]);
  }

  const symbols = [...files.values()].flatMap(extractSymbols);
  const chunks = [...files.values()].flatMap(chunkFile);
  const store = new HashedTfIdfStore();
  store.add(chunks);
  const graph = buildGraph(files, imports, importedBy);

  const languages: Record<string, number> = {};
  let totalLines = 0;
  for (const f of files.values()) {
    languages[f.lang] = (languages[f.lang] ?? 0) + f.lines;
    totalLines += f.lines;
  }
  return {
    repoId: raw.repoId,
    name: raw.name,
    files,
    imports,
    importedBy,
    externalDeps,
    symbols,
    chunks,
    store,
    graph,
    summary: { repoId: raw.repoId, name: raw.name, fileCount: files.size, totalLines, languages, skipped: raw.skipped, truncated: raw.truncated },
    builtAt: Date.now(),
  };
}

// ---------- per-instance cache ----------
// Serverless instances are reused while warm, so modules usually hit this cache.
// On a cold instance we re-ingest from the source the client sends with every request.
const g = globalThis as unknown as { __keelCache?: Map<string, RepoIndex> };
const cache = (g.__keelCache ??= new Map());
const CACHE_MAX = 8;

export async function getIndex(source: RepoSource, onProgress: (msg: string) => void): Promise<{ index: RepoIndex; cached: boolean }> {
  const key = sourceKey(source);
  const hit = cache.get(key);
  if (hit) return { index: hit, cached: true };
  const raw = await ingest(source, onProgress);
  onProgress(`Indexing ${raw.files.size} files (imports, symbols, chunks, vectors)…`);
  const index = buildIndex(raw);
  cache.set(key, index);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return { index, cached: false };
}

// ---------- helpers used by agents ----------
export function numbered(content: string, start = 1, end?: number) {
  const lines = content.split("\n");
  const e = Math.min(end ?? lines.length, lines.length);
  const width = String(e).length;
  return lines.slice(start - 1, e).map((l, i) => `${String(start + i).padStart(width)}| ${l}`).join("\n");
}

export function fileTree(index: RepoIndex, max = 400) {
  const lines = [...index.files.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, max)
    .map((f) => {
      const syms = index.symbols.filter((s) => s.path === f.path && s.exported).slice(0, 8).map((s) => s.name);
      return `${f.path} (${f.lines} lines${syms.length ? `; exports: ${syms.join(", ")}` : ""})`;
    });
  if (index.files.size > max) lines.push(`… and ${index.files.size - max} more files`);
  return lines.join("\n");
}
