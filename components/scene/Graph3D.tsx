"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Html, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { kc, pulses, useKeelcode } from "@/lib/client/store";
import { drones, scope } from "@/lib/client/scope";
import { computeLayout, hullDepth, hullFloor, hullWidth, IDLE_HULL, stageFreeWidth, stageOffsetX, type Compartment, type Layout } from "./layout";

type Hull = Layout["hull"];
const SONAR = new THREE.Color("#35f2c2");
const AMBER = new THREE.Color("#ffb547");
const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();
const tmpV = new THREE.Vector3();

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

/* ------------------------------------------------------------------ hull frame */

function sectionPoints(z: number, hull: Hull, seg = 18) {
  const u = z / hull.halfLength;
  const w = hullWidth(u, hull.width);
  const d = hullDepth(u, hull.depth);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= seg; i++) {
    const x = -w + (2 * w * i) / seg;
    pts.push(new THREE.Vector3(x, hull.deck - hullFloor(x, w, d), z));
  }
  return pts;
}

function HullFrame({ hull, compartments, busy }: { hull: Hull; compartments: Compartment[]; busy: boolean }) {
  const { ribs, bulkheads, beams } = useMemo(() => {
    const ribs: number[] = [], bulk: number[] = [], beams: number[] = [];
    const push = (arr: number[], pts: THREE.Vector3[]) => {
      for (let i = 1; i < pts.length; i++) arr.push(pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z);
    };
    const L = hull.halfLength;
    const step = Math.max(3.5, hull.length / 40);
    for (let z = -L + step / 2; z < L; z += step) push(ribs, sectionPoints(z, hull));
    for (const c of compartments) {
      push(bulk, sectionPoints(c.z0, hull));
      push(bulk, sectionPoints(c.z1, hull));
      const w0 = hullWidth(c.z0 / L, hull.width);
      bulk.push(-w0, hull.deck, c.z0, w0, hull.deck, c.z0);
    }
    const lines: ((z: number) => THREE.Vector3)[] = [
      (z) => new THREE.Vector3(hullWidth(z / L, hull.width), hull.deck, z),
      (z) => new THREE.Vector3(-hullWidth(z / L, hull.width), hull.deck, z),
      (z) => { const w = hullWidth(z / L, hull.width) * 0.72; return new THREE.Vector3(w, hull.deck - hullFloor(w, hullWidth(z / L, hull.width), hullDepth(z / L, hull.depth)), z); },
      (z) => { const w = -hullWidth(z / L, hull.width) * 0.72; return new THREE.Vector3(w, hull.deck - hullFloor(w, hullWidth(z / L, hull.width), hullDepth(z / L, hull.depth)), z); },
      (z) => new THREE.Vector3(0, hull.deck - hullDepth(z / L, hull.depth), z),
    ];
    for (const f of lines) {
      const pts: THREE.Vector3[] = [];
      for (let z = -L; z <= L + 0.01; z += step / 2) pts.push(f(z));
      push(beams, pts);
    }
    beams.push(0, hull.deck - hullDepth(1, hull.depth), L, 0, hull.deck + 3, L + 4);
    const sw = hullWidth(-1, hull.width);
    beams.push(-sw, hull.deck, -L, sw, hull.deck, -L);
    const g = (a: number[]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      return geo;
    };
    return { ribs: g(ribs), bulkheads: g(bulk), beams: g(beams) };
  }, [hull, compartments]);

  const mat = useRef<THREE.LineBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.opacity = (busy ? 0.2 : 0.13) + Math.sin(clock.elapsedTime * 1.3) * 0.03;
  });

  return (
    <group>
      <lineSegments geometry={ribs}><lineBasicMaterial ref={mat} color="#35f2c2" transparent opacity={0.14} depthWrite={false} /></lineSegments>
      <lineSegments geometry={beams}><lineBasicMaterial color="#5ff7d2" transparent opacity={0.38} depthWrite={false} /></lineSegments>
      <lineSegments geometry={bulkheads}><lineBasicMaterial color="#9dffe6" transparent opacity={0.5} depthWrite={false} /></lineSegments>
      <Bridge hull={hull} />
    </group>
  );
}

/** The Keelcode mark as glowing line geometry (64×64 SVG grid → world units). */
function useMarkGeometry(size: number) {
  return useMemo(() => {
    const P = (x: number, y: number) => [((x - 32) / 64) * size, (-(y - 32) / 64) * size, 0];
    const hull = [[23, 11], [8, 27], [32, 51], [56, 27], [41, 11]];
    const pts: number[] = [];
    for (let i = 1; i < hull.length; i++) pts.push(...P(hull[i - 1][0], hull[i - 1][1]), ...P(hull[i][0], hull[i][1]));
    pts.push(...P(32, 51), ...P(32, 61));
    // ring centred on the origin; placed at the contact position by the caller
    const ring: number[] = [];
    const rr = (7 / 64) * size;
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2;
      ring.push(Math.cos(a0) * rr, Math.sin(a0) * rr, 0, Math.cos(a1) * rr, Math.sin(a1) * rr, 0);
    }
    const g = (a: number[]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      return geo;
    };
    return { mark: g(pts), ring: g(ring), dot: P(32, 29) as [number, number, number] };
  }, [size]);
}

/** Conning tower at the bow: where the crew launches from, flying the Keelcode mark. */
function Bridge({ hull }: { hull: Hull }) {
  const z = hull.halfLength - 6;
  const beacon = useRef<THREE.Group>(null);
  const ring = useRef<THREE.LineSegments>(null);
  const { mark, ring: ringGeo, dot } = useMarkGeometry(9);
  const mast = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 6, 0), new THREE.Vector3(0, 9.5, 0)]), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beacon.current) beacon.current.position.y = 13 + Math.sin(t * 1.2) * 0.5;
    if (ring.current) {
      const k = (t * 0.6) % 1;
      ring.current.scale.setScalar(1 + k * 1.8);
      (ring.current.material as THREE.LineBasicMaterial).opacity = (1 - k) * 0.8;
    }
  });
  return (
    <group position={[0, hull.deck, z]}>
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[4, 6, 7]} />
        <meshBasicMaterial color="#35f2c2" wireframe transparent opacity={0.35} />
      </mesh>
      <lineSegments geometry={mast}>
        <lineBasicMaterial color="#35f2c2" transparent opacity={0.5} />
      </lineSegments>
      <group ref={beacon} position={[0, 13, 0]}>
        <Billboard>
          <lineSegments geometry={mark}>
            <lineBasicMaterial color={[0.7, 3.2, 2.5]} toneMapped={false} />
          </lineSegments>
          <lineSegments geometry={ringGeo} position={dot}>
            <lineBasicMaterial color={[0.5, 2, 1.6]} toneMapped={false} transparent opacity={0.6} />
          </lineSegments>
          <lineSegments ref={ring} geometry={ringGeo} position={dot}>
            <lineBasicMaterial color={[0.6, 2.4, 2]} toneMapped={false} transparent opacity={0.6} depthWrite={false} />
          </lineSegments>
          <mesh position={dot}>
            <circleGeometry args={[0.42, 20]} />
            <meshBasicMaterial color={[1, 4, 3.2]} toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ ocean */

function MarineSnow({ extent, count = 1400 }: { extent: number; count?: number }) {
  const { geo, seeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * extent * 3;
      pos[i * 3 + 1] = (Math.random() - 0.5) * extent * 1.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * extent * 3;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geo, seeds };
  }, [extent, count]);
  useFrame(({ clock }, dt) => {
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    const half = extent * 0.8;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      a[i * 3 + 1] -= dt * (0.6 + (seeds[i] % 1) * 0.8);
      a[i * 3] += Math.sin(t * 0.3 + seeds[i]) * dt * 0.25;
      if (a[i * 3 + 1] < -half) a[i * 3 + 1] = half;
    }
    p.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.35} color="#9dd8cc" transparent opacity={0.35} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Seabed({ y, extent, busy, reduced }: { y: number; extent: number; busy: boolean; reduced: boolean }) {
  const sweep = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const size = extent * 4;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const ang = reduced ? 0.6 : t * (busy ? 1.1 : 0.45);
    scope.sweep = ang;
    if (sweep.current) sweep.current.rotation.z = -ang;
    if (rings.current) {
      rings.current.children.forEach((m, i) => {
        const age = reduced ? 0.5 : (t * (busy ? 0.5 : 0.25) + i / 3) % 1;
        m.scale.setScalar(4 + age * extent * 1.6);
        ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - age) * 0.22;
      });
    }
  });
  return (
    <group position={[0, y, 0]}>
      <gridHelper args={[size, 48, "#1f6f5e", "#0d2a2a"]} />
      <mesh ref={sweep} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[size / 2, 48, 0, 0.55]} />
        <meshBasicMaterial color="#35f2c2" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={rings} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <ringGeometry args={[0.98, 1, 96]} />
            <meshBasicMaterial color="#35f2c2" transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ contacts, conduits, packets */

function bez(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
}

function Vessel({ layout, reduced }: { layout: Layout; reduced: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const [hover, setHover] = useState<string | null>(null);
  const selected = useKeelcode((s) => s.selected);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const camera = useThree((s) => s.camera);
  const focus = useRef<THREE.Vector3 | null>(null);
  const base = useMemo(() => layout.nodes.map((n) => new THREE.Color(n.color)), [layout]);
  const SEG = 22;

  const curves = useMemo(
    () =>
      layout.edges.map((e) => {
        const a = new THREE.Vector3(e.s.x, e.s.y, e.s.z), b = new THREE.Vector3(e.t.x, e.t.y, e.t.z);
        const d = a.distanceTo(b);
        const c = a.clone().add(b).multiplyScalar(0.5);
        c.y = Math.max(a.y, b.y, layout.hull.deck) + 3 + d * 0.32;
        return { a, b, c, e };
      }),
    [layout]
  );

  const conduitGeo = useMemo(() => {
    const pos = new Float32Array(curves.length * SEG * 6);
    const col = new Float32Array(curves.length * SEG * 6);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    curves.forEach(({ a, b, c }, i) => {
      for (let k = 0; k < SEG; k++) {
        bez(a, c, b, k / SEG, p);
        bez(a, c, b, (k + 1) / SEG, q);
        pos.set([p.x, p.y, p.z, q.x, q.y, q.z], (i * SEG + k) * 6);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [curves]);

  const packetCount = Math.min(curves.length, 280);
  const packetGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(1, packetCount) * 3), 3));
    return g;
  }, [packetCount]);
  const phases = useMemo(() => curves.map((x) => hash(x.e.s.id + x.e.t.id)), [curves]);

  const active = hover ?? selected;

  useEffect(() => {
    const col = conduitGeo.getAttribute("color") as THREE.BufferAttribute;
    const dim = new THREE.Color("#3fd1ac");
    curves.forEach(({ e }, i) => {
      const on = !!active && (e.s.id === active || e.t.id === active);
      const c = on ? SONAR.clone().multiplyScalar(2.2) : dim.clone().multiplyScalar(active ? 0.18 : 0.55);
      for (let k = 0; k < SEG; k++) {
        const fade = 0.55 + 0.45 * Math.sin((k / SEG) * Math.PI);
        col.setXYZ((i * SEG + k) * 2, c.r * fade, c.g * fade, c.b * fade);
        col.setXYZ((i * SEG + k) * 2 + 1, c.r * fade, c.g * fade, c.b * fade);
      }
    });
    col.needsUpdate = true;
  }, [active, conduitGeo, curves]);

  useEffect(() => {
    if (!selected) return;
    const n = layout.byId.get(selected);
    if (n) focus.current = new THREE.Vector3(n.x, n.y, n.z);
  }, [selected, layout]);

  useFrame(({ clock }, dt) => {
    const m = mesh.current, h = halo.current;
    if (!m || !h) return;
    const now = performance.now();
    const t = clock.elapsedTime;
    const nb = active ? layout.neighbors.get(active) : null;
    for (const n of layout.nodes) {
      const p = pulses.get(n.id);
      const age = p ? (now - p.t) / 1000 : Infinity;
      const pulsing = age < 4;
      const wave = pulsing ? (reduced ? 0.7 : 0.6 + 0.4 * Math.sin(age * 10)) * (1 - age / 4) : 0;
      const isActive = n.id === active;
      const isNb = !!nb?.has(n.id);
      const breathe = reduced ? 1 : 1 + Math.sin(t * 1.6 + n.index) * 0.05;
      const s = n.r * breathe * (isActive ? 1.45 : 1) * (1 + (reduced ? 0 : wave * 0.6));
      tmpObj.position.set(n.x, n.y, n.z);
      tmpObj.rotation.set(t * 0.3 + n.index, t * 0.2, 0);
      tmpObj.scale.setScalar(s);
      tmpObj.updateMatrix();
      m.setMatrixAt(n.index, tmpObj.matrix);
      tmpObj.rotation.set(0, 0, 0);
      tmpObj.scale.setScalar(s * (1.7 + (pulsing ? wave * 1.5 : 0)));
      tmpObj.updateMatrix();
      h.setMatrixAt(n.index, tmpObj.matrix);

      tmpColor.copy(base[n.index]);
      let k = 0.85;
      if (active && !isActive && !isNb) k = 0.3;
      if (isNb) { tmpColor.lerp(SONAR, 0.4); k = 1.3; }
      if (isActive) { tmpColor.lerp(SONAR, 0.8); k = 2.6; }
      if (pulsing) { tmpColor.lerp(p!.kind === "cite" ? SONAR : AMBER, Math.min(1, wave + 0.25)); k = Math.max(k, 1.2 + wave * 2.2); }
      tmpColor.multiplyScalar(k);
      m.setColorAt(n.index, tmpColor);
      tmpColor.multiplyScalar(pulsing || isActive ? 0.22 : 0.07);
      h.setColorAt(n.index, tmpColor);
    }
    m.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;

    if (!reduced && packetCount > 0) {
      const pa = packetGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < packetCount; i++) {
        const { a, b, c } = curves[i];
        bez(b, c, a, (t * 0.22 + phases[i]) % 1, tmpV);
        pa.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
      }
      pa.needsUpdate = true;
    }

    if (focus.current && controls) {
      const tg = controls.target;
      if (reduced) tg.copy(focus.current);
      else tg.lerp(focus.current, Math.min(1, dt * 3));
      const dir = camera.position.clone().sub(tg).normalize();
      const desired = focus.current.clone().add(dir.multiplyScalar(48));
      if (reduced) camera.position.copy(desired);
      else camera.position.lerp(desired, Math.min(1, dt * 1.6));
      if (tg.distanceTo(focus.current) < 0.3 && camera.position.distanceTo(desired) < 1) focus.current = null;
      controls.update();
    }
  });

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId != null ? layout.nodes[e.instanceId] : null);
  const labelNodes = useMemo(() => [...layout.nodes].sort((a, b) => b.degree - a.degree).slice(0, layout.nodes.length <= 40 ? 10 : 6), [layout]);
  const hovered = hover ? layout.byId.get(hover) : null;
  const sel = selected ? layout.byId.get(selected) : null;

  return (
    <group>
      <lineSegments geometry={conduitGeo}>
        <lineBasicMaterial vertexColors transparent opacity={0.9} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      {!reduced && packetCount > 0 && (
        <points geometry={packetGeo}>
          <pointsMaterial size={0.9} color={[1.2, 3.2, 2.6]} toneMapped={false} transparent opacity={0.9} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      )}
      <instancedMesh ref={halo} args={[undefined, undefined, layout.nodes.length]} raycast={() => null}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial transparent opacity={0.45} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, layout.nodes.length]}
        onPointerMove={(e) => { e.stopPropagation(); const n = pick(e); setHover(n?.id ?? null); document.body.style.cursor = n ? "crosshair" : ""; }}
        onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); const n = pick(e); if (n) kc.set({ selected: n.id }); }}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {layout.compartments.map((c) => (
        <Html key={c.name} position={[0, layout.hull.deck + 2.5, c.zc]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: c.color, opacity: 0.75 }}>
            ▾ {c.name} <span className="opacity-60">·{c.files}</span>
          </div>
        </Html>
      ))}
      {labelNodes.filter((n) => n !== hovered && n !== sel).map((n) => (
        <Html key={n.id} position={[n.x, n.y - n.r - 1.4, n.z]} center distanceFactor={110} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap font-mono text-[10px] text-ink-dim/70">{n.label}</div>
        </Html>
      ))}
      {[hovered, sel].filter((n, i, a) => n && a.indexOf(n) === i).map((n) => (
        <Html key={"x" + n!.id} position={[n!.x, n!.y + n!.r + 2.5, n!.z]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap border border-sonar/40 bg-abyss/90 px-2 py-1 font-mono text-[10.5px] text-ink shadow-[0_0_18px_rgba(53,242,194,.25)]">
            <span className="text-sonar">◆</span> {n!.id} <span className="text-ink-faint">· {n!.lines} ln · {layout.neighbors.get(n!.id)?.size ?? 0} links</span>
          </div>
        </Html>
      ))}
      <Pings layout={layout} reduced={reduced} />
      <Drones layout={layout} reduced={reduced} />
    </group>
  );
}

/* ------------------------------------------------------------------ pings & drones */

const PING_POOL = 18;
function Pings({ layout, reduced }: { layout: Layout; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = performance.now();
    const live: { n: Layout["nodes"][number]; age: number; kind: string }[] = [];
    for (const [id, p] of pulses) {
      const age = (now - p.t) / 1000;
      if (age > 1.8) continue;
      const n = layout.byId.get(id);
      if (n) live.push({ n, age, kind: p.kind });
    }
    live.sort((a, b) => a.age - b.age);
    g.children.forEach((m, i) => {
      const l = live[i];
      m.visible = !!l;
      if (!l) return;
      m.position.set(l.n.x, l.n.y, l.n.z);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar(l.n.r * (1.5 + (reduced ? 1.5 : l.age * 7)));
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.color.set(l.kind === "cite" ? "#35f2c2" : "#ffb547").multiplyScalar(2);
      mat.opacity = Math.max(0, 1 - l.age / 1.8);
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: PING_POOL }, (_, i) => (
        <mesh key={i} visible={false}>
          <ringGeometry args={[0.9, 1, 48]} />
          <meshBasicMaterial transparent toneMapped={false} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

const DRONE_POOL = 14;
function Drones({ layout, reduced }: { layout: Layout; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const beams = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DRONE_POOL * 6), 3));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const home = useMemo(() => new THREE.Vector3(0, layout.hull.deck + 9, layout.hull.halfLength - 6), [layout]);
  const last = useRef(new Map<string, THREE.Vector3>());

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const now = performance.now();
    const t = clock.elapsedTime;
    for (const [id, d] of drones) if (d.done !== null && now - d.done > 1400) { drones.delete(id); last.current.delete(id); }
    const list = [...drones.values()].slice(-DRONE_POOL);
    scope.dronesOut = list.filter((d) => d.done === null).length;
    const bp = beams.getAttribute("position") as THREE.BufferAttribute;
    let beamN = 0;
    g.children.forEach((m, i) => {
      const d = list[i];
      m.visible = !!d;
      if (!d) return;
      const ph = hash(d.id) * Math.PI * 2;
      const node = d.target ? layout.byId.get(d.target) : null;
      const station = node
        ? new THREE.Vector3(node.x + Math.cos(t * 1.8 + ph) * (node.r + 3), node.y + node.r + 2.5 + Math.sin(t * 2.3 + ph) * 0.6, node.z + Math.sin(t * 1.8 + ph) * (node.r + 3))
        : new THREE.Vector3(home.x + Math.cos(t * 0.9 + ph) * 5, home.y + 3 + Math.sin(t * 1.3 + ph), home.z + Math.sin(t * 0.9 + ph) * 5);
      let pos: THREE.Vector3;
      if (d.done === null) {
        const p = reduced ? 1 : ease((now - d.born) / 1300);
        pos = home.clone().lerp(station, p);
        pos.y += Math.sin(Math.PI * p) * 10;
        last.current.set(d.id, pos.clone());
        if (node && p >= 1) {
          bp.setXYZ(beamN * 2, pos.x, pos.y, pos.z);
          bp.setXYZ(beamN * 2 + 1, node.x, node.y, node.z);
          beamN++;
        }
      } else {
        const from = last.current.get(d.id) ?? station;
        const q = reduced ? 1 : ease((now - d.done) / 1100);
        pos = from.clone().lerp(home, q);
        pos.y += Math.sin(Math.PI * q) * 6;
      }
      m.position.copy(pos);
      m.rotation.set(t * 2, t * 3 + ph, 0);
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.color.copy(d.role === "reader" ? AMBER : SONAR).multiplyScalar(d.done === null ? 3 : 1.4);
      const sc = d.role === "reader" ? 0.9 : 1.2;
      m.scale.setScalar(d.done !== null ? sc * (1 - Math.min(1, (now - d.done) / 1300) * 0.6) : sc);
    });
    bp.needsUpdate = true;
    beams.setDrawRange(0, beamN * 2);
  });

  return (
    <group>
      <group ref={group}>
        {Array.from({ length: DRONE_POOL }, (_, i) => (
          <mesh key={i} visible={false}>
            <tetrahedronGeometry args={[1, 0]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
        ))}
      </group>
      <lineSegments geometry={beams}>
        <lineBasicMaterial color={[2.4, 1.5, 0.4]} toneMapped={false} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

/* ------------------------------------------------------------------ camera rig */

function Rig({ hull, reduced, idle, hasLayout }: { hull: Hull; reduced: boolean; idle: boolean; hasLayout: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const panels = useKeelcode((s) => !!s.summary);
  const span = Math.max(hull.halfLength, hull.width * 1.6);

  // Frame the whole hull inside the open area between the panels.
  const fitDist = useMemo(() => {
    const free = stageFreeWidth(size.width, panels);
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (free / Math.max(1, size.height)));
    const byWidth = (span * 1.05) / Math.tan(hfov / 2);
    const byHeight = (Math.max(hull.depth * 1.6, span * 0.55)) / Math.tan(vfov / 2);
    return Math.max(byWidth, byHeight) * (size.width < 768 ? 1.05 : 0.82);
  }, [size.width, size.height, panels, span, hull, camera]);
  useEffect(() => {
    const dir = new THREE.Vector3(0.62, 0.36, 0.7).normalize();
    camera.position.copy(dir.multiplyScalar(fitDist)).add(new THREE.Vector3(0, hull.deck - hull.depth * 0.4, 0));
    camera.lookAt(0, hull.deck - hull.depth * 0.4, 0);
  }, [camera, fitDist, hull]);
  useEffect(() => {
    if (controls) controls.target.set(0, hull.deck - hull.depth * 0.4, 0);
  }, [controls, hull]);
  useEffect(() => {
    const dx = stageOffsetX(size.width, panels);
    if (dx) camera.setViewOffset(size.width, size.height, dx, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, panels]);

  useFrame(() => {
    const tg = controls?.target ?? new THREE.Vector3();
    const v = camera.position.clone().sub(tg);
    scope.range = v.length();
    scope.bearing = ((Math.atan2(v.x, v.z) * 180) / Math.PI + 360) % 360;
    scope.pitch = (Math.asin(v.y / Math.max(0.001, v.length())) * 180) / Math.PI;
  });

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.07}
      autoRotate={!reduced && idle}
      autoRotateSpeed={hasLayout ? 0.28 : 0.5}
      minDistance={12}
      maxDistance={Math.max(fitDist * 2.5, span * 5)}
      maxPolarAngle={Math.PI * 0.62}
      enablePan
    />
  );
}

/* ------------------------------------------------------------------ root */

export default function Graph3D({ onFail }: { onFail: (reason: string) => void }) {
  const graph = useKeelcode((s) => s.graph);
  const busy = useKeelcode((s) => s.ingesting || Object.values(s.runs).some((r) => r.running));
  const layout = useMemo(() => (graph && graph.nodes.length ? computeLayout(graph) : null), [graph]);
  const hull = layout?.hull ?? IDLE_HULL;
  const [reduced, setReduced] = useState(false);
  const [lite, setLite] = useState(false);
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    setLite((navigator.hardwareConcurrency ?? 8) <= 4 || window.innerWidth < 768);
    return () => mq.removeEventListener("change", on);
  }, []);

  const poke = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 9000);
  };
  const extent = Math.max(hull.halfLength, hull.width * 2);

  return (
    <Canvas
      dpr={[1, lite ? 1.25 : 1.75]}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true }}
      camera={{ fov: 42, near: 0.5, far: 4000, position: [120, 60, 120] }}
      onPointerDown={poke}
      onWheel={poke}
      onPointerMissed={() => kc.set({ selected: null })}
      onCreated={({ gl, scene }) => {
        scene.background = new THREE.Color("#02070b");
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onFail("WebGL context was lost"); }, { once: true });
      }}
    >
      <fogExp2 attach="fog" args={["#02070b", 0.55 / (extent * 3)]} />
      <HullFrame hull={hull} compartments={layout?.compartments ?? []} busy={busy} />
      {layout && <Vessel layout={layout} reduced={reduced} />}
      <Seabed y={hull.deck - hull.depth - 14} extent={extent} busy={busy} reduced={reduced} />
      {!reduced && <MarineSnow extent={extent * 1.4} count={lite ? 600 : 1400} />}
      <Rig hull={hull} reduced={reduced} idle={idle} hasLayout={!!layout} />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={lite ? 0.7 : 1.05} luminanceThreshold={0.22} luminanceSmoothing={0.2} radius={0.75} />
        <Vignette offset={0.22} darkness={0.75} />
        <Noise opacity={lite ? 0 : 0.035} premultiply />
      </EffectComposer>
    </Canvas>
  );
}
