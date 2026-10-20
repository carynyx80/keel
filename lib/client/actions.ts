"use client";
import { handleCommon, kc, postSSE } from "./store";
import { drones, recallDrone } from "./scope";
import type { ModuleId, RepoSource } from "@/lib/engine/types";

let ingestCtl: AbortController | null = null;
const runCtl: Partial<Record<ModuleId, AbortController>> = {};

export async function loadSource(source: RepoSource, label: string): Promise<boolean> {
  ingestCtl?.abort();
  Object.values(runCtl).forEach((c) => c?.abort());
  ingestCtl = new AbortController();
  kc.resetRuns();
  kc.set({ source, sourceLabel: label, ingesting: true, ingestError: undefined, summary: null, graph: null, files: [], selected: null, viewer: null, progress: "Connecting…" });
  let ok = false;
  await postSSE("/api/ingest", { source }, (e) => {
    handleCommon(e, "ingest");
    if (e.type === "result") {
      const d = e.data as { files: { path: string; lines: number; lang: string }[]; hasApiKey: boolean; model: string };
      kc.set({ files: d.files, hasApiKey: d.hasApiKey, model: d.model });
      ok = true;
    }
    if (e.type === "error") kc.set({ ingestError: { code: e.code, message: e.message } });
  }, ingestCtl.signal);
  kc.set({ ingesting: false, progress: ok ? "" : kc.get().progress });
  return ok;
}

export async function runModule(m: ModuleId, params: Record<string, unknown> = {}) {
  const { source } = kc.get();
  if (!source) return;
  runCtl[m]?.abort();
  const ctl = (runCtl[m] = new AbortController());
  kc.updateRun(m, { running: true, error: undefined, result: undefined, partials: {}, stream: "", findings: [], startedAt: Date.now(), finishedAt: undefined });
  await postSSE(`/api/run/${m}`, { source, params }, (e) => {
    handleCommon(e, m);
    switch (e.type) {
      case "finding":
        kc.updateRun(m, (r) => ({ findings: [...r.findings, e.finding] }));
        break;
      case "delta":
        kc.updateRun(m, (r) => ({ stream: r.stream + e.text }));
        break;
      case "partial":
        kc.updateRun(m, (r) => ({ partials: { ...r.partials, [e.key]: [...(r.partials[e.key] ?? []), e.value] } }));
        break;
      case "result":
        kc.updateRun(m, { result: e.data });
        break;
      case "error":
        kc.updateRun(m, { error: { code: e.code, message: e.message } });
        if (e.code === "NO_API_KEY") kc.set({ hasApiKey: false });
        break;
    }
  }, ctl.signal);
  kc.updateRun(m, { running: false, finishedAt: Date.now() });
  kc.set({ progress: "" });
  for (const id of drones.keys()) if (id.startsWith(m + ":")) recallDrone(id);
}

export function cancelModule(m: ModuleId) {
  runCtl[m]?.abort();
  for (const id of drones.keys()) if (id.startsWith(m + ":")) recallDrone(id);
  kc.updateRun(m, { running: false, error: { code: "CANCELLED", message: "Recalled by the bridge." } });
}

export function openFile(path: string, line?: number, endLine?: number) {
  kc.set({ viewer: { path, line, endLine }, selected: path });
}

export async function fetchFile(path: string) {
  const { source } = kc.get();
  const res = await fetch("/api/file", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, path }) });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j as { path: string; lang: string; content: string; imports: string[]; importedBy: string[] };
}
