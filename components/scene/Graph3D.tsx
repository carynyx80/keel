"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { keel, pulses, useKeel } from "@/lib/client/store";
import { computeLayout, stageOffsetX, type Layout } from "./layout";

const ACCENT = new THREE.Color("#2cf5c8");
const ALARM = new THREE.Color("#ffb86b");
const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

function KeelWireframe({ busy, reduced }: { busy: boolean; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const geom = useMemo(() => {
    // A ship's keel and ribs: beam along z, U-shaped ribs whose width follows a hull profile.
    const pts: number[] = [];
    const L = 70, ribs = 17, seg = 14;
    pts.push(0, -22, -L, 0, -22, L);
    const prof = (z: number) => Math.pow(Math.cos(((z / L) * Math.PI) / 2), 0.6);
    const tops: [number, number, number][][] = [[], []];
    for (let i = 0; i < ribs; i++) {
      const z = -L + (2 * L * (i + 0.5)) / ribs;
      const w = 26 * prof(z), h = 22 + 6 * prof(z);
      let prev: [number, number, number] | null = null;
      for (let k = 0; k <= seg; k++) {
        const a = Math.PI + (Math.PI * k) / seg;
        const p: [number, number, number] = [Math.cos(a) * w, -22 + h * (1 + Math.sin(a)), z];
        if (prev) pts.push(...prev, ...p);
        prev = p;
      }
      tops[0].push([-w, -22 + h, z]);
      tops[1].push([w, -22 + h, z]);
    }
    for (const side of tops) for (let i = 1; i < side.length; i++) pts.push(...side[i - 1], ...side[i]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    if (!group.current || reduced) return;
    group.current.rotation.y += dt * (busy ? 0.6 : 0.08);
  });
  return (
    <group ref={group} rotation={[0.25, 0.6, 0]}>
      <lineSegments geometry={geom}>
        <lineBasicMaterial color="#2cf5c8" transparent opacity={busy ? 0.55 : 0.28} />
      </lineSegments>
    </group>
  );
}

function GraphMesh({ layout, reduced }: { layout: Layout; reduced: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const [hover, setHover] = useState<string | null>(null);
  const selected = useKeel((s) => s.selected);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const camera = useThree((s) => s.camera);
  const focusTarget = useRef<THREE.Vector3 | null>(null);

  const base = useMemo(() => layout.nodes.map((n) => new THREE.Color(n.color)), [layout]);

  const edgeGeom = useMemo(() => {
    const pos = new Float32Array(layout.edges.length * 6);
    const col = new Float32Array(layout.edges.length * 6);
    layout.edges.forEach((e, i) => pos.set([e.s.x, e.s.y, e.s.z, e.t.x, e.t.y, e.t.z], i * 6));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [layout]);

  // Edge colours: neighbours of the hovered/selected node light up.
  const active = hover ?? selected;
  useEffect(() => {
    const col = edgeGeom.getAttribute("color") as THREE.BufferAttribute;
    const dim = new THREE.Color("#3b5566");
    layout.edges.forEach((e, i) => {
      const on = active && (e.s.id === active || e.t.id === active);
      const c = on ? ACCENT : dim;
      const k = active && !on ? 0.35 : 1;
      col.setXYZ(i * 2, c.r * k, c.g * k, c.b * k);
      col.setXYZ(i * 2 + 1, c.r * k, c.g * k, c.b * k);
    });
    col.needsUpdate = true;
  }, [active, edgeGeom, layout]);

  // Camera focus on selection.
  useEffect(() => {
    if (!selected) return;
    const n = layout.byId.get(selected) ?? layout.byId.get(selected.split("/").slice(0, -1).join("/") + "/");
    if (n) focusTarget.current = new THREE.Vector3(n.x, n.y, n.z);
  }, [selected, layout]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now();
    const nb = active ? layout.neighbors.get(active) : null;
    for (const n of layout.nodes) {
      const p = pulses.get(n.id);
      const age = p ? (now - p.t) / 1000 : Infinity;
      const pulsing = age < 4;
      const wave = pulsing ? (reduced ? 0.6 : 0.6 + 0.4 * Math.sin(age * 9)) * (1 - age / 4) : 0;
      const isActive = n.id === active;
      const isNb = nb?.has(n.id);
      const s = n.r * (1 + (isActive ? 0.5 : 0) + (reduced ? 0 : wave * 0.8));
      tmpObj.position.set(n.x, n.y, n.z);
      tmpObj.scale.setScalar(s);
      tmpObj.updateMatrix();
      m.setMatrixAt(n.index, tmpObj.matrix);
      tmpColor.copy(base[n.index]);
      if (active && !isActive && !isNb) tmpColor.multiplyScalar(0.35);
      if (isActive || isNb) tmpColor.lerp(ACCENT, isActive ? 0.85 : 0.45);
      if (pulsing) tmpColor.lerp(p!.kind === "cite" ? ACCENT : ALARM, Math.min(1, wave + 0.2));
      m.setColorAt(n.index, tmpColor);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    if (focusTarget.current && controls) {
      const t = controls.target;
      if (reduced) t.copy(focusTarget.current);
      else t.lerp(focusTarget.current, Math.min(1, dt * 3));
      const desired = focusTarget.current.clone().add(new THREE.Vector3(0, 14, 95));
      if (reduced) camera.position.copy(desired);
      else camera.position.lerp(desired, Math.min(1, dt * 1.5));
      if (t.distanceTo(focusTarget.current) < 0.3 && camera.position.distanceTo(desired) < 1) focusTarget.current = null;
      controls.update();
    }
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const n = e.instanceId != null ? layout.nodes[e.instanceId] : null;
    setHover(n?.id ?? null);
    document.body.style.cursor = n ? "pointer" : "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const n = e.instanceId != null ? layout.nodes[e.instanceId] : null;
    if (n) keel.set({ selected: n.id });
  };

  const labelNodes = useMemo(() => {
    const top = [...layout.nodes].sort((a, b) => b.degree - a.degree).slice(0, layout.nodes.length <= 40 ? 14 : 8);
    return top;
  }, [layout]);
  const hovered = hover ? layout.byId.get(hover) : null;
  const sel = selected ? layout.byId.get(selected) : null;

  return (
    <group>
      <lineSegments ref={lines} geometry={edgeGeom}>
        <lineBasicMaterial vertexColors transparent opacity={0.55} />
      </lineSegments>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, layout.nodes.length]}
        onPointerMove={onMove}
        onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}
        onClick={onClick}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.35} metalness={0.2} emissive="#0b2a26" emissiveIntensity={0.6} flatShading />
      </instancedMesh>
      {labelNodes.map((n) => (
        <Html key={n.id} position={[n.x, n.y + n.r + 1.6, n.z]} center distanceFactor={90} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap font-mono text-[10px] text-ink-dim/80">{n.label}</div>
        </Html>
      ))}
      {[hovered, sel].filter((n, i, a) => n && a.indexOf(n) === i).map((n) => (
        <Html key={"x" + n!.id} position={[n!.x, n!.y + n!.r + 3, n!.z]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <div className="glass whitespace-nowrap rounded px-2 py-1 font-mono text-[11px] text-ink">
            {n!.id} <span className="text-ink-faint">· {n!.lines} lines{n!.kind === "group" ? ` · ${n!.files} files` : ""} · {layout.neighbors.get(n!.id)?.size ?? 0} links</span>
          </div>
        </Html>
      ))}
    </group>
  );
}

function Rig({ radius, reduced, idle }: { radius: number; reduced: boolean; idle: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const panels = useKeel((s) => !!s.summary);
  useEffect(() => {
    camera.position.set(0, radius * 0.35, radius * 2.3 + 40);
    camera.lookAt(0, 0, 0);
  }, [camera, radius]);
  useEffect(() => {
    const dx = stageOffsetX(size.width, panels);
    if (dx) camera.setViewOffset(size.width, size.height, dx, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, panels]);
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotate={!reduced && idle}
      autoRotateSpeed={0.35}
      minDistance={15}
      maxDistance={radius * 5 + 120}
      enablePan
    />
  );
}

export default function Graph3D({ onFail }: { onFail: (reason: string) => void }) {
  const graph = useKeel((s) => s.graph);
  const ingesting = useKeel((s) => s.ingesting);
  const anyRunning = useKeel((s) => Object.values(s.runs).some((r) => r.running));
  const layout = useMemo(() => (graph && graph.nodes.length ? computeLayout(graph) : null), [graph]);
  const [reduced, setReduced] = useState(false);
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const poke = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 8000);
  };

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true }}
      camera={{ fov: 50, near: 0.5, far: 3000, position: [0, 30, 170] }}
      onPointerDown={poke}
      onWheel={poke}
      onPointerMissed={() => keel.set({ selected: null })}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onFail("WebGL context was lost"); }, { once: true });
      }}
    >
      <fog attach="fog" args={["#04070b", 120, 520]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[60, 80, 40]} intensity={1.2} />
      <pointLight position={[-80, -40, -60]} intensity={600} color="#2cf5c8" />
      {layout ? <GraphMesh layout={layout} reduced={reduced} /> : <KeelWireframe busy={ingesting || anyRunning} reduced={reduced} />}
      <Rig radius={layout?.radius ?? 60} reduced={reduced} idle={idle} />
    </Canvas>
  );
}
