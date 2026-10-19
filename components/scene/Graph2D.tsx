"use client";
import { useEffect, useMemo, useRef } from "react";
import { keel, pulses, useKeel } from "@/lib/client/store";
import { computeLayout, stageOffsetX } from "./layout";

/** 2D canvas fallback: same layout, projected, with hover/click/pulse parity. */
export default function Graph2D() {
  const graph = useKeel((s) => s.graph);
  const busy = useKeel((s) => s.ingesting || Object.values(s.runs).some((r) => r.running));
  const layout = useMemo(() => (graph && graph.nodes.length ? computeLayout(graph) : null), [graph]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<string | null>(null);
  const proj = useRef<{ id: string; x: number; y: number; r: number }[]>([]);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let angle = 0.4;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!reduced) angle += dt * (layout ? 0.04 : busy ? 0.5 : 0.08);

      if (!layout) {
        // Side profile of a keel with ribs.
        ctx.strokeStyle = `rgba(44,245,200,${busy ? 0.55 : 0.3})`;
        ctx.lineWidth = 1;
        const cx = w / 2, cy = h / 2 + 40, L = Math.min(w, 900) * 0.38;
        ctx.beginPath(); ctx.moveTo(cx - L, cy); ctx.lineTo(cx + L, cy); ctx.stroke();
        for (let i = 0; i <= 16; i++) {
          const t = -1 + (2 * i) / 16;
          const hh = 70 * Math.pow(Math.cos((t * Math.PI) / 2), 0.6) * (0.8 + 0.2 * Math.cos(angle + i));
          ctx.beginPath(); ctx.moveTo(cx + t * L, cy); ctx.lineTo(cx + t * L * 1.03, cy - hh); ctx.stroke();
        }
        raf = requestAnimationFrame(draw);
        return;
      }
      const scale = (Math.min(w, h) * 0.36) / layout.radius;
      const cx = w / 2 - stageOffsetX(w, true);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const P = new Map<string, { x: number; y: number; d: number }>();
      for (const n of layout.nodes) {
        const x = n.x * cos - n.z * sin, z = n.x * sin + n.z * cos;
        const persp = 1 / (1 + z / (layout.radius * 4));
        P.set(n.id, { x: cx + x * scale * persp, y: h / 2 - n.y * scale * persp, d: persp });
      }
      const sel = keel.get().selected;
      const active = hover.current ?? sel;
      const nb = active ? layout.neighbors.get(active) : null;
      for (const e of layout.edges) {
        const a = P.get(e.s.id)!, b = P.get(e.t.id)!;
        const on = active && (e.s.id === active || e.t.id === active);
        ctx.strokeStyle = on ? "rgba(44,245,200,0.9)" : active ? "rgba(59,85,102,0.25)" : "rgba(59,85,102,0.55)";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const t = performance.now();
      proj.current = [];
      for (const n of [...layout.nodes].sort((a, b) => P.get(a.id)!.d - P.get(b.id)!.d)) {
        const p = P.get(n.id)!;
        const pu = pulses.get(n.id);
        const age = pu ? (t - pu.t) / 1000 : Infinity;
        const r = n.r * scale * 0.35 * p.d + (age < 4 && !reduced ? 4 * (1 - age / 4) : 0);
        ctx.globalAlpha = active && n.id !== active && !nb?.has(n.id) ? 0.35 : 1;
        ctx.fillStyle = n.id === active || age < 4 ? "#2cf5c8" : n.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, r), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        proj.current.push({ id: n.id, x: p.x, y: p.y, r: Math.max(5, r) });
        if (n.id === active || (layout.nodes.length <= 40 && n.degree >= 3)) {
          ctx.fillStyle = n.id === active ? "#e6f1f5" : "rgba(159,179,191,0.8)";
          ctx.font = "11px ui-monospace, monospace";
          ctx.fillText(n.id === active ? n.id : n.label, p.x + r + 4, p.y + 3);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layout, busy]);

  const pick = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best: string | null = null, bd = Infinity;
    for (const p of proj.current) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r + 4 && d < bd) { bd = d; best = p.id; }
    }
    return best;
  };

  return (
    <canvas
      ref={canvas}
      className="h-full w-full"
      onPointerMove={(e) => { hover.current = pick(e); e.currentTarget.style.cursor = hover.current ? "pointer" : ""; }}
      onClick={(e) => keel.set({ selected: pick(e) })}
    />
  );
}
