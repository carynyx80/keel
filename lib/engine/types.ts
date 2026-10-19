// Shared types between the engine, the API routes and the UI.

export type RepoSource =
  | { kind: "demo" }
  | { kind: "git"; url: string; ref?: string }
  | { kind: "zip"; name: string; base64: string };

export type ModuleId = "cartograph" | "interrogator" | "porter" | "spec" | "narrator";

export interface RepoFile {
  path: string;
  content: string;
  lang: string;
  lines: number;
  bytes: number;
}

export interface SymbolDef {
  name: string;
  kind: "function" | "class" | "const" | "route" | "type";
  path: string;
  line: number;
  exported: boolean;
}

export interface Chunk {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface GraphNode {
  id: string; // file path, or "dir/" for an aggregated group node
  label: string;
  module: string;
  kind: "file" | "group";
  lines: number;
  complexity: number;
  degree: number;
  files?: number; // for group nodes
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface RepoGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  modules: string[];
  aggregated: boolean; // true when level-of-detail collapsed files into directory nodes
  totalFiles: number;
}

export interface RepoSummary {
  repoId: string;
  name: string;
  fileCount: number;
  totalLines: number;
  languages: Record<string, number>;
  skipped: number;
  truncated: boolean;
}

export interface Citation {
  path: string;
  line: number;
  endLine?: number;
  valid?: boolean;
}

export interface Finding {
  agent: string;
  slice: string;
  summary: string;
  points: { claim: string; path: string; line: number; endLine: number }[];
}

// Server-sent events. Every module streams these; the UI and the 3D scene consume them.
export type KeelEvent =
  | { type: "progress"; stage: string; message: string; pct?: number }
  | { type: "summary"; summary: RepoSummary }
  | { type: "graph"; graph: RepoGraph }
  | { type: "agent"; id: string; role: "planner" | "reader" | "synthesizer" | "verifier"; status: "start" | "done" | "error"; label: string; paths?: string[]; detail?: string }
  | { type: "finding"; finding: Finding }
  | { type: "focus"; paths: string[] } // ask the scene to pulse nodes
  | { type: "delta"; text: string } // streaming text (Interrogator answer)
  | { type: "partial"; key: string; value: unknown } // module-specific partial results
  | { type: "result"; module: ModuleId | "ingest"; data: unknown }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

export class KeelError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}
