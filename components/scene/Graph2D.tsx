"use client";
import { useEffect, useMemo, useRef } from "react";
import { kc, pulses, useKeelcode } from "@/lib/client/store";
import { drones } from "@/lib/client/scope";
import { computeLayout, hullDepth, IDLE_HULL, stageFreeWidth, stageOffsetX, type Layout } from "./layout";

/** 2D fallback: a side-elevation schematic of the same vessel, with the same live signals. */
export default function Graph2D() {
  const graph = useKeelcode((s) => s.graph);
  const busy = useKeelcode((s) => s.ingesting || Object.values(s.runs).some((r) => r.running));
  const panels = useKeelcode((s) => !!s.summary);
  const layout = useMemo<Layout | null>(() => (graph && graph.nodes.length ? computeLayout(graph) : null), [graph]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<string | null>(null);
  const proj = useRef<{ id: string; x: number; y: number; r: number }[]>([]);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const draw = () => {
      const now = performance.now();
      const t = (now - start) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#02070b";
      ctx.fillRect(0, 0, w, h);

      const hull = layout?.hull ?? IDLE_HULL;
      const free = stageFreeWidth(w, panels);
      const cx = w / 2 - stageOffsetX(w, panels);
      const scale = Math.min((free * 0.86) / hull.length, (h * 0.42) / (hull.depth + 16));
      const cy = h * 0.5 - (hull.depth * scale) * 0.15;
      const X = (z: number) => cx + z * scale; // bow to the right
      const Y = (y: number) => cy - y * scale;

      // grid
      ctx.strokeStyle = "rgba(53,242,194,0.05)";
      ctx.lineWidth = 1;
      for (let gx = (cx % 40); gx < w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = (cy % 40); gy < h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
      // waterline & seabed
      ctx.strokeStyle = "rgba(53,242,194,0.25)";
      ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.moveTo(0, Y(hull.deck + 8)); ctx.lineTo(w, Y(hull.deck + 8)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(31,111,94,0.6)";
      ctx.beginPath(); ctx.moveTo(0, Y(hull.deck - hull.depth - 14)); ctx.lineTo(w, Y(hull.deck - hull.depth - 14)); ctx.stroke();

      // hull profile
      ctx.strokeStyle = `rgba(95,247,210,${busy ? 0.75 : 0.55})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(X(-hull.halfLength), Y(hull.deck));
      ctx.lineTo(X(hull.halfLength + 4), Y(hull.deck + 3));
      for (let z = hull.halfLength; z >= -hull.halfLength; z -= hull.length / 80) ctx.lineTo(X(z), Y(hull.deck - hullDepth(z / hull.halfLength, hull.depth)));
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "rgba(53,242,194,0.03)";
      ctx.fill();
      // bridge
      ctx.strokeRect(X(hull.halfLength - 9.5), Y(hull.deck + 6), 7 * scale, 6 * scale);

      // compartments
      ctx.font = "10px ui-monospace, monospace";
      for (const comp of layout?.compartments ?? []) {
        for (const z of [comp.z0, comp.z1]) {
          ctx.strokeStyle = "rgba(157,255,230,0.35)";
          ctx.beginPath(); ctx.moveTo(X(z), Y(hull.deck)); ctx.lineTo(X(z), Y(hull.deck - hullDepth(z / hull.halfLength, hull.depth))); ctx.stroke();
        }
        ctx.fillStyle = comp.color;
        ctx.globalAlpha = 0.8;
        const room = (comp.z0 - comp.z1) * scale + 4;
        let label = `▾ ${comp.name}`;
        if (ctx.measureText(label).width > room) label = `▾ ${comp.name.split("/").pop()}`;
        if (ctx.measureText(label).width > room) label = "▾";
        ctx.fillText(label, X(comp.zc) - ctx.measureText(label).width / 2, Y(hull.deck + 3.5));
        ctx.globalAlpha = 1;
      }

      // sonar scan line
      const span = hull.length + 40;
      const sx = reduced ? hull.halfLength * 0.3 : ((t * (busy ? 0.45 : 0.18)) % 1) * span - span / 2;
      const grad = ctx.createLinearGradient(X(sx) - 60, 0, X(sx), 0);
      grad.addColorStop(0, "rgba(53,242,194,0)");
      grad.addColorStop(1, "rgba(53,242,194,0.18)");
      ctx.fillStyle = grad;
      ctx.fillRect(X(sx) - 60, 0, 60, h);
      ctx.strokeStyle = "rgba(53,242,194,0.6)";
      ctx.beginPath(); ctx.moveTo(X(sx), 0); ctx.lineTo(X(sx), h); ctx.stroke();

      if (layout) {
        const sel = kc.get().selected;
        const active = hover.current ?? sel;
        const nb = active ? layout.neighbors.get(active) : null;
        const P = (n: Layout["nodes"][number]) => ({ x: X(n.z), y: Y(n.y) + n.x * scale * 0.18 });
        // conduits
        for (const e of layout.edges) {
          const a = P(e.s), b = P(e.t);
          const on = !!active && (e.s.id === active || e.t.id === active);
          ctx.strokeStyle = on ? "rgba(53,242,194,0.95)" : active ? "rgba(31,122,104,0.15)" : "rgba(31,122,104,0.5)";
          ctx.lineWidth = on ? 1.4 : 1;
          const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y, Y(hull.deck)) - Math.abs(a.x - b.x) * 0.22 - 8;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
        }
        // contacts
        proj.current = [];
        for (const n of layout.nodes) {
          const p = P(n);
          const pu = pulses.get(n.id);
          const age = pu ? (now - pu.t) / 1000 : Infinity;
          const r = Math.max(2.5, n.r * scale * 0.55);
          const lit = Math.abs(p.x - X(sx)) < 18;
          ctx.globalAlpha = active && n.id !== active && !nb?.has(n.id) ? 0.3 : 1;
          ctx.fillStyle = n.id === active ? "#9dffe6" : age < 4 ? (pu!.kind === "cite" ? "#35f2c2" : "#ffb547") : n.color;
          ctx.shadowColor = ctx.fillStyle as string;
          ctx.shadowBlur = lit || age < 4 || n.id === active ? 14 : 4;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          if (age < 1.8 && !reduced) {
            ctx.strokeStyle = pu!.kind === "cite" ? "rgba(53,242,194,0.8)" : "rgba(255,181,71,0.8)";
            ctx.globalAlpha = 1 - age / 1.8;
            ctx.beginPath(); ctx.arc(p.x, p.y, r + age * 26, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          proj.current.push({ id: n.id, x: p.x, y: p.y, r: Math.max(6, r) });
          if (n.id === active) {
            ctx.fillStyle = "#d7f2ea";
            ctx.font = "11px ui-monospace, monospace";
            ctx.fillText(n.id, p.x + r + 6, p.y - r - 4);
          }
        }
        // drones
        const home = { x: X(hull.halfLength - 6), y: Y(hull.deck + 9) };
        for (const d of drones.values()) {
          const node = d.target ? layout.byId.get(d.target) : null;
          const tgt = node ? P(node) : { x: home.x + Math.cos(t + d.born) * 14, y: home.y - 10 };
          const k = d.done === null ? Math.min(1, (now - d.born) / 1300) : 1 - Math.min(1, (now - d.done) / 1100);
          const x = home.x + (tgt.x - home.x) * k, y = home.y + (tgt.y - home.y) * k - Math.sin(Math.PI * k) * 30;
          ctx.fillStyle = d.role === "reader" ? "#ffb547" : "#35f2c2";
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0;
          if (node && d.done === null && k >= 1) {
            ctx.strokeStyle = "rgba(255,181,71,0.5)";
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layout, busy, panels]);

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
      onPointerMove={(e) => { hover.current = pick(e); e.currentTarget.style.cursor = hover.current ? "crosshair" : ""; }}
      onClick={(e) => kc.set({ selected: pick(e) })}
    />
  );
}
