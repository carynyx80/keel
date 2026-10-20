"use client";
import { useSyncExternalStore } from "react";
import type { Finding, KeelcodeEvent, ModuleId, RepoGraph, RepoSource, RepoSummary } from "@/lib/engine/types";
import { clearDrones, launchDrone, recallDrone } from "./scope";

export interface AgentEntry { id: string; role: string; status: "start" | "done" | "error"; label: string; detail?: string; t: number; module: string }
export interface ModuleRun { running: boolean; error?: { code: string; message: string }; result?: unknown; partials: Record<string, unknown[]>; stream: string; findings: Finding[]; startedAt?: number; finishedAt?: number }

export interface KeelcodeState {
  source: RepoSource | null;
  sourceLabel: string;
  ingesting: boolean;
  ingestError?: { code: string; message: string };
  progress: string;
  summary: RepoSummary | null;
  graph: RepoGraph | null;
  files: { path: string; lines: number; lang: string }[];
  hasApiKey: boolean | null;
  model: string;
  active: ModuleId;
  runs: Record<ModuleId, ModuleRun>;
  log: AgentEntry[];
  selected: string | null; // node id focused in the scene
  viewer: { path: string; line?: number; endLine?: number } | null;
  renderMode: "auto" | "3d" | "2d";
}

const emptyRun = (): ModuleRun => ({ running: false, partials: {}, stream: "", findings: [] });

const initial: KeelcodeState = {
  source: null,
  sourceLabel: "",
  ingesting: false,
  progress: "",
  summary: null,
  graph: null,
  files: [],
  hasApiKey: null,
  model: "",
  active: "cartograph",
  runs: { cartograph: emptyRun(), interrogator: emptyRun(), porter: emptyRun(), spec: emptyRun(), narrator: emptyRun() },
  log: [],
  selected: null,
  viewer: null,
  renderMode: "auto",
};

let state = initial;
const listeners = new Set<() => void>();

// Pulses live outside React state: the 3D scene reads them every frame without re-rendering.
export const pulses = new Map<string, { t: number; kind: "read" | "cite" }>();
export const pulse = (paths: string[], kind: "read" | "cite" = "read") => {
  const t = performance.now();
  for (const p of paths) pulses.set(p, { t, kind });
};

export const kc = {
  get: () => state,
  set(patch: Partial<KeelcodeState> | ((s: KeelcodeState) => Partial<KeelcodeState>)) {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  updateRun(m: ModuleId, patch: Partial<ModuleRun> | ((r: ModuleRun) => Partial<ModuleRun>)) {
    kc.set((s) => ({ runs: { ...s.runs, [m]: { ...s.runs[m], ...(typeof patch === "function" ? patch(s.runs[m]) : patch) } } }));
  },
  resetRuns() {
    clearDrones();
    kc.set({ runs: { cartograph: emptyRun(), interrogator: emptyRun(), porter: emptyRun(), spec: emptyRun(), narrator: emptyRun() }, log: [] });
  },
};

export function useKeelcode<T>(sel: (s: KeelcodeState) => T): T {
  return useSyncExternalStore(kc.subscribe, () => sel(state), () => sel(initial));
}

/** POSTs JSON and parses a Server-Sent Events response. */
export async function postSSE(url: string, body: unknown, onEvent: (e: KeelcodeEvent) => void, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onEvent({ type: "error", code: "NETWORK", message: "Couldn't reach the Keelcode server." });
    return;
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    const msg = res.status === 413 ? "Upload too large for the server (Vercel caps request bodies at 4.5 MB)." : res.status === 504 ? "The server timed out (serverless duration limit)." : `Server error ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
    onEvent({ type: "error", code: `HTTP_${res.status}`, message: msg });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let sawDone = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const e = JSON.parse(line.slice(6)) as KeelcodeEvent;
          if (e.type === "done") sawDone = true;
          onEvent(e);
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
  }
  if (!sawDone) onEvent({ type: "error", code: "STREAM_CUT", message: "The connection closed before the job finished — most likely the serverless time limit. Try a smaller repo or a narrower question." });
}

export function logAgent(module: string, e: Extract<KeelcodeEvent, { type: "agent" }>) {
  kc.set((s) => {
    const log = [...s.log];
    const idx = log.findIndex((x) => x.id === e.id && x.module === module && x.status === "start");
    const entry: AgentEntry = { id: e.id, role: e.role, status: e.status, label: e.label, detail: e.detail, t: Date.now(), module };
    if (idx >= 0 && e.status !== "start") log[idx] = entry;
    else log.push(entry);
    return { log: log.slice(-200) };
  });
  if (e.paths?.length) pulse(e.paths, "read");
  const key = `${module}:${e.id}`;
  if (e.status === "start") launchDrone(key, e.role, e.role === "planner" || e.role === "synthesizer" ? null : e.paths?.[0] ?? null);
  else recallDrone(key);
}

export function handleCommon(e: KeelcodeEvent, module: string) {
  switch (e.type) {
    case "progress":
      kc.set({ progress: e.message });
      break;
    case "summary":
      kc.set({ summary: e.summary });
      break;
    case "graph":
      kc.set({ graph: e.graph });
      break;
    case "agent":
      logAgent(module, e);
      break;
    case "focus":
      pulse(e.paths, "cite");
      break;
  }
}
