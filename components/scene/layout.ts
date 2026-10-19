"use client";
import { forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import type { GraphNode, RepoGraph } from "@/lib/engine/types";

export interface LaidNode extends GraphNode { x: number; y: number; z: number; r: number; color: string; index: number; compartment: number }
export interface Compartment { name: string; index: number; z0: number; z1: number; zc: number; files: number; color: string }
export interface Layout {
  nodes: LaidNode[];
  byId: Map<string, LaidNode>;
  edges: { s: LaidNode; t: LaidNode; w: number }[];
  neighbors: Map<string, Set<string>>;
  compartments: Compartment[];
  hull: { length: number; halfLength: number; width: number; depth: number; deck: number };
  radius: number;
}

/** Muted per-compartment hues; the sonar accent is reserved for activity and highlights. */
export function moduleColor(i: number, n: number) {
  // Stay inside one sea palette: teal → cyan → blue → violet-blue, alternating lightness.
  const hue = 158 + (n <= 1 ? 0 : (i / (n - 1)) * 80);
  const light = i % 2 ? 70 : 60;
  return `hsl(${hue.toFixed(0)}, 62%, ${light}%)`;
}

/** Hull half-width at normalised position u ∈ [-1, 1] (bow = +1). Fuller aft, finer bow. */
export function hullWidth(u: number, width: number) {
  const a = Math.min(1, Math.abs(u));
  const bowFine = u > 0 ? 1.9 : 3.2;
  return width * Math.max(0.16, Math.pow(1 - Math.pow(a, bowFine), 0.55));
}
/** Keel depth at normalised position u: the hull rises toward bow and stern. */
export function hullDepth(u: number, depth: number) {
  const a = Math.min(1, Math.abs(u));
  return depth * Math.max(0.28, 1 - Math.pow(a, u > 0 ? 3 : 5));
}
/** Depth of the hull bottom below the deck at cross-section offset x (U-shaped section). */
export function hullFloor(x: number, w: number, depth: number) {
  const t = Math.min(1, Math.abs(x) / Math.max(w, 0.001));
  return depth * Math.sqrt(Math.max(0, 1 - t * t * t));
}

/**
 * Lays the repo out as a ship: each module is a compartment along the keel (z axis),
 * ordered bow → stern by dependency flow; files sit inside the hull cross-section.
 */
export function computeLayout(graph: RepoGraph): Layout {
  // Order compartments: modules that mostly import others go forward (bow), foundations aft.
  const flow = new Map<string, number>();
  for (const m of graph.modules) flow.set(m, 0);
  const modOf = new Map(graph.nodes.map((n) => [n.id, n.module]));
  for (const e of graph.edges) {
    const a = modOf.get(e.source), b = modOf.get(e.target);
    if (!a || !b || a === b) continue;
    flow.set(a, (flow.get(a) ?? 0) + e.weight);
    flow.set(b, (flow.get(b) ?? 0) - e.weight);
  }
  const counts = new Map<string, number>();
  for (const n of graph.nodes) counts.set(n.module, (counts.get(n.module) ?? 0) + 1);
  const mods = graph.modules.filter((m) => counts.get(m)).sort((a, b) => (flow.get(b)! - flow.get(a)!) || a.localeCompare(b));

  const maxFiles = Math.max(1, ...mods.map((m) => counts.get(m)!));
  const width = 14 + Math.sqrt(maxFiles) * 3.4;
  const depth = width * 0.95;
  const deck = 0;
  const lens = mods.map((m) => 9 + Math.sqrt(counts.get(m)!) * 5.5);
  const gap = 2.5;
  const length = lens.reduce((a, b) => a + b, 0) + gap * Math.max(0, mods.length - 1) + 16;
  const halfLength = length / 2;

  let cursor = halfLength - 8; // bow end, leave room for the bridge
  const compartments: Compartment[] = mods.map((name, index) => {
    const z0 = cursor, z1 = cursor - lens[index];
    cursor = z1 - gap;
    return { name, index, z0, z1, zc: (z0 + z1) / 2, files: counts.get(name)!, color: moduleColor(index, mods.length) };
  });
  const compOf = new Map(compartments.map((c) => [c.name, c]));

  // Seed: golden-angle spiral inside each compartment's half-disc section.
  const seen = new Map<string, number>();
  const nodes: LaidNode[] = graph.nodes.map((n, index) => {
    const c = compOf.get(n.module) ?? compartments[0];
    const k = seen.get(c.name) ?? 0;
    seen.set(c.name, k + 1);
    const w = hullWidth(c.zc / halfLength, width);
    const rr = Math.sqrt((k + 0.5) / c.files) * 0.8;
    const th = k * 2.39996;
    const x = Math.cos(th) * rr * w * 0.85;
    const y = deck - 2 - Math.abs(Math.sin(th)) * rr * hullFloor(x, w, hullDepth(c.zc / halfLength, depth)) * 0.85;
    const z = c.zc + (((k * 0.618) % 1) - 0.5) * (c.z0 - c.z1) * 0.6;
    return {
      ...n,
      index,
      compartment: c.index,
      x, y, z,
      r: Math.max(0.9, Math.min(4.2, 0.75 + Math.sqrt(n.lines) / 8 + (n.kind === "group" ? 1 : 0))),
      color: c.color,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = graph.edges.filter((e) => byId.has(e.source) && byId.has(e.target)).map((e) => ({ source: e.source, target: e.target, w: e.weight }));

  // Keep every node inside its compartment and inside the hull, every tick.
  const contain = () => {
    for (const n of nodes) {
      const c = compartments[n.compartment];
      const pad = Math.min(2.5, (c.z0 - c.z1) * 0.2);
      n.z = Math.min(c.z0 - pad, Math.max(c.z1 + pad, n.z));
      const w = hullWidth(n.z / halfLength, width) - n.r - 1;
      n.x = Math.max(-w, Math.min(w, n.x));
      const floor = deck - hullFloor(n.x, w + n.r + 1, hullDepth(n.z / halfLength, depth)) + n.r + 1;
      n.y = Math.max(floor, Math.min(deck - n.r - 1, n.y));
    }
  };
  const sim = forceSimulation(nodes, 3)
    .force("link", forceLink(links).id((d: LaidNode) => d.id).distance(9).strength(0.08))
    .force("charge", forceManyBody().strength(-14).distanceMax(30))
    .force("contain", contain)
    .stop();
  const ticks = nodes.length > 150 ? 120 : 200;
  for (let i = 0; i < ticks; i++) sim.tick();
  contain();

  const neighbors = new Map<string, Set<string>>();
  for (const n of nodes) neighbors.set(n.id, new Set());
  const edges = links.map((l) => {
    const s = (typeof l.source === "object" ? l.source : byId.get(l.source)) as LaidNode;
    const t = (typeof l.target === "object" ? l.target : byId.get(l.target)) as LaidNode;
    neighbors.get(s.id)!.add(t.id);
    neighbors.get(t.id)!.add(s.id);
    return { s, t, w: l.w };
  });
  return { nodes, byId, edges, neighbors, compartments, hull: { length, halfLength, width, depth, deck }, radius: Math.max(halfLength, width) };
}

/** A default hull for the empty "awaiting contact" scene. */
export const IDLE_HULL = { length: 120, halfLength: 60, width: 22, depth: 21, deck: 0 };

/** Width (px) of the open stage between the desktop side panels. */
export function stageFreeWidth(w: number, panelsVisible: boolean) {
  if (!panelsVisible || w < 768) return w;
  const inner = Math.min(w - 32, 1680);
  return Math.max(240, inner - 264 - 12 - Math.min(580, w * 0.44) - 12);
}

/** Horizontal shift (px) that centres the stage in the gap between the desktop side panels. */
export function stageOffsetX(w: number, panelsVisible: boolean) {
  if (!panelsVisible || w < 768) return 0;
  const inner = Math.min(w - 32, 1680);
  const left = (w - inner) / 2;
  const sidebarRight = left + 264 + 12;
  const panelLeft = left + inner - Math.min(580, w * 0.44) - 12;
  return w / 2 - (sidebarRight + panelLeft) / 2;
}
