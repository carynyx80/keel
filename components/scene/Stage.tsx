"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { keel, useKeel } from "@/lib/client/store";
import Graph2D from "./Graph2D";

const Graph3D = dynamic(() => import("./Graph3D"), { ssr: false, loading: () => null });

class Boundary extends Component<{ onError: (m: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    this.props.onError(e.message || "3D renderer crashed");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function detect(): { mode: "3d" | "2d"; reason?: string } {
  try {
    if (new URLSearchParams(location.search).get("render") === "2d") return { mode: "2d", reason: "forced by ?render=2d" };
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return { mode: "2d", reason: "WebGL is unavailable in this browser" };
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if ((nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2) return { mode: "2d", reason: "low-power device detected" };
    if (nav.connection?.saveData) return { mode: "2d", reason: "data-saver is on" };
    return { mode: "3d" };
  } catch {
    return { mode: "2d", reason: "WebGL check failed" };
  }
}

/** Full-viewport stage behind the UI. Picks 3D, falls back to 2D automatically. */
export default function Stage() {
  const pref = useKeel((s) => s.renderMode);
  const [auto, setAuto] = useState<{ mode: "3d" | "2d"; reason?: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    setAuto(detect());
  }, []);
  if (!auto) return null;

  const mode = failure ? "2d" : pref === "auto" ? auto.mode : pref;
  const reason = failure ?? (pref === "auto" ? auto.reason : pref === "2d" ? "2D selected" : undefined);
  return (
    <div className="fixed inset-0 -z-0" aria-hidden="true">
      {mode === "3d" ? (
        <Boundary onError={(m) => setFailure(`3D failed (${m}) — switched to 2D`)}>
          <Graph3D onFail={(m) => setFailure(`${m} — switched to 2D`)} />
        </Boundary>
      ) : (
        <Graph2D />
      )}
      <StageBadge mode={mode} reason={reason} canTry3d={auto.mode === "3d" && !failure} />
    </div>
  );
}

function StageBadge({ mode, reason, canTry3d }: { mode: "3d" | "2d"; reason?: string; canTry3d: boolean }) {
  return (
    <div className="pointer-events-auto fixed top-[182px] right-1/2 z-30 hidden translate-x-[calc(50%-var(--stage-dx,0px))] items-center gap-2 border border-sonar/15 bg-abyss/80 px-2 py-1 font-mono text-[10px] text-ink-faint md:flex">
      <span className={mode === "3d" ? "text-sonar" : "text-ink-dim"}>RENDER {mode.toUpperCase()}</span>
      {reason && <span className="max-w-[260px] truncate" title={reason}>{reason}</span>}
      {canTry3d && (
        <button className="underline-offset-2 hover:text-ink hover:underline" onClick={() => keel.set({ renderMode: mode === "3d" ? "2d" : "3d" })}>
          switch to {mode === "3d" ? "2D" : "3D"}
        </button>
      )}
    </div>
  );
}
