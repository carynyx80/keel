"use client";
import { forceCenter, forceLink, forceManyBody, forceSimulation, forceX, forceY, forceZ } from "d3-force-3d";
import type { GraphNode, RepoGraph } from "@/lib/engine/types";

export interface LaidNode extends GraphNode { x: number; y: number; z: number; r: number; color: string; index: number }
export interface Layout { nodes: LaidNode[]; byId: Map<string, LaidNode>; edges: { s: LaidNode; t: LaidNode; w: number }[]; neighbors: Map<string, Set<string>>; radius: number }

/** Muted per-module hues; the sonar accent is reserved for activity/highlights. */
export function moduleColor(i: number, n: number) {
  const hue = (200 + (i * 360) / Math.max(n, 1) * 0.85) % 360;
  return `hsl(${hue.toFixed(0)}, 42%, 62%)`;
}

export function computeLayout(graph: RepoGraph): Layout {
  const mods = graph.modules;
  const modIndex = new Map(mods.map((m, i) => [m, i]));
  // Module anchors on a Fibonacci sphere so modules form readable clusters.
  const R = 40 + Math.sqrt(graph.nodes.length) * 4;
  const anchors = mods.map((_, i) => {
    const y = 1 - (2 * (i + 0.5)) / Math.max(mods.length, 1);
    const rad = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    return { x: Math.cos(th) * rad * R * 0.7, y: y * R * 0.55, z: Math.sin(th) * rad * R * 0.7 };
  });

  const nodes: LaidNode[] = graph.nodes.map((n, index) => {
    const mi = modIndex.get(n.module) ?? 0;
    const a = anchors[mi] ?? { x: 0, y: 0, z: 0 };
    // Deterministic jitter so the layout is stable between renders.
    let h = 0;
    for (const c of n.id) h = (h * 31 + c.charCodeAt(0)) | 0;
    const j = (k: number) => (((h >> k) & 0xff) / 255 - 0.5) * 12;
    return {
      ...n,
      index,
      x: a.x + j(0), y: a.y + j(8), z: a.z + j(16),
      r: Math.max(1.1, Math.min(5, 0.9 + Math.sqrt(n.lines) / 7 + (n.kind === "group" ? 1.2 : 0))),
      color: moduleColor(mi, mods.length),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = graph.edges.filter((e) => byId.has(e.source) && byId.has(e.target)).map((e) => ({ source: e.source, target: e.target, w: e.weight }));

  const sim = forceSimulation(nodes, 3)
    .force("link", forceLink(links).id((d: LaidNode) => d.id).distance(14).strength(0.35))
    .force("charge", forceManyBody().strength(-38).distanceMax(120))
    .force("x", forceX((d: LaidNode) => anchors[modIndex.get(d.module) ?? 0]?.x ?? 0).strength(0.06))
    .force("y", forceY((d: LaidNode) => anchors[modIndex.get(d.module) ?? 0]?.y ?? 0).strength(0.06))
    .force("z", forceZ((d: LaidNode) => anchors[modIndex.get(d.module) ?? 0]?.z ?? 0).strength(0.06))
    .force("center", forceCenter(0, 0, 0))
    .stop();
  const ticks = nodes.length > 150 ? 160 : 260;
  for (let i = 0; i < ticks; i++) sim.tick();

  const neighbors = new Map<string, Set<string>>();
  for (const n of nodes) neighbors.set(n.id, new Set());
  const edges = links.map((l) => {
    const s = (typeof l.source === "object" ? l.source : byId.get(l.source)) as LaidNode;
    const t = (typeof l.target === "object" ? l.target : byId.get(l.target)) as LaidNode;
    neighbors.get(s.id)!.add(t.id);
    neighbors.get(t.id)!.add(s.id);
    return { s, t, w: l.w };
  });
  let radius = 10;
  for (const n of nodes) radius = Math.max(radius, Math.hypot(n.x, n.y, n.z));
  return { nodes, byId, edges, neighbors, radius };
}

/** Horizontal shift (px) that centres the graph in the gap between the desktop side panels. */
export function stageOffsetX(w: number, panelsVisible: boolean) {
  if (!panelsVisible || w < 768) return 0;
  const inner = Math.min(w - 32, 1600);
  const left = (w - inner) / 2;
  const sidebarRight = left + 240 + 12;
  const panelLeft = left + inner - Math.min(560, w * 0.46) - 12;
  return w / 2 - (sidebarRight + panelLeft) / 2;
}
