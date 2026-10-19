"use client";
import { useEffect, useState } from "react";
import { keel, useKeel } from "@/lib/client/store";
import { loadSource, openFile, runModule } from "@/lib/client/actions";
import type { ModuleId } from "@/lib/engine/types";
import Stage from "./scene/Stage";
import SourceBar from "./SourceBar";
import ActivityLog from "./ActivityLog";
import CodeViewer from "./CodeViewer";
import Cartograph from "./modules/Cartograph";
import Interrogator from "./modules/Interrogator";
import Porter from "./modules/Porter";
import Spec from "./modules/Spec";
import Narrator from "./modules/Narrator";
import { Button, ErrorBox, Spinner } from "./ui/bits";

const MODULES: { id: ModuleId; name: string; glyph: string; blurb: string }[] = [
  { id: "cartograph", name: "Cartograph", glyph: "◎", blurb: "Architecture map" },
  { id: "interrogator", name: "Interrogator", glyph: "?", blurb: "Q&A with citations" },
  { id: "porter", name: "Porter", glyph: "⇄", blurb: "Port + equivalence" },
  { id: "spec", name: "Spec Recovery", glyph: "≡", blurb: "OpenAPI · ER · rules" },
  { id: "narrator", name: "Narrator", glyph: "➝", blurb: "Onboarding tour" },
];

function ModuleBody({ id }: { id: ModuleId }) {
  // Keep every panel mounted so in-flight streams and chat history survive tab switches.
  return (
    <>
      <div hidden={id !== "cartograph"}><Cartograph /></div>
      <div hidden={id !== "interrogator"}><Interrogator /></div>
      <div hidden={id !== "porter"}><Porter /></div>
      <div hidden={id !== "spec"}><Spec /></div>
      <div hidden={id !== "narrator"}><Narrator /></div>
    </>
  );
}

function ModuleSwitch({ orientation }: { orientation: "row" | "col" }) {
  const active = useKeel((s) => s.active);
  const runs = useKeel((s) => s.runs);
  return (
    <nav aria-label="Modules" className={orientation === "col" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto"}>
      {MODULES.map((m) => {
        const r = runs[m.id];
        const on = active === m.id;
        return (
          <button
            key={m.id}
            onClick={() => keel.set({ active: m.id })}
            aria-current={on ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left transition ${on ? "bg-sonar/10 text-sonar" : "text-ink-dim hover:bg-white/5 hover:text-ink"}`}
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-md border font-mono text-sm ${on ? "border-sonar/60" : "border-white/10"}`}>{m.glyph}</span>
            <span className={orientation === "col" ? "flex flex-col" : "flex flex-col pr-1"}>
              <span className="text-sm font-medium leading-tight">{m.name}</span>
              <span className="font-mono text-[10px] leading-tight text-ink-faint">
                {r.running ? <span className="inline-flex items-center gap-1 text-[#ffb86b]"><Spinner /> running</span> : r.error ? <span className="text-alarm">error</span> : r.result ? <span className="text-sonar">ready</span> : m.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function SelectedCard() {
  const selected = useKeel((s) => s.selected);
  const graph = useKeel((s) => s.graph);
  const node = selected ? graph?.nodes.find((n) => n.id === selected) : null;
  if (!node) return null;
  const isFile = node.kind === "file";
  return (
    <div className="glass pointer-events-auto rounded-xl px-4 py-3">
      <div className="font-mono text-xs text-sonar">{node.id}</div>
      <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{node.module} · {node.lines} lines · complexity {node.complexity} · {node.degree} links{node.files ? ` · ${node.files} files` : ""}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {isFile && <Button className="!py-1 text-xs" onClick={() => openFile(node.id)}>Open</Button>}
        {isFile && (
          <Button className="!py-1 text-xs" onClick={() => { keel.set({ active: "interrogator" }); runModule("interrogator", { question: `What is ${node.id} responsible for, and what breaks if it is deleted?`, history: [] }); }}>
            What breaks if deleted?
          </Button>
        )}
        <Button className="!py-1 text-xs" onClick={() => keel.set({ selected: null })}>Clear</Button>
      </div>
    </div>
  );
}

export default function KeelApp() {
  const active = useKeel((s) => s.active);
  const summary = useKeel((s) => s.summary);
  const ingesting = useKeel((s) => s.ingesting);
  const ingestError = useKeel((s) => s.ingestError);
  const hasKey = useKeel((s) => s.hasApiKey);
  const progress = useKeel((s) => s.progress);
  const [drawer, setDrawer] = useState(false);
  const [mobileTab, setMobileTab] = useState<"module" | "agents">("module");

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((j) => keel.set({ hasApiKey: j.hasApiKey, model: j.model })).catch(() => {});
  }, []);

  const empty = !summary && !ingesting;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Stage />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(4,7,11,0.85)_100%)]" />

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col gap-3 p-3 md:p-4">
        {/* Top bar */}
        <header className="pointer-events-auto mx-auto w-full max-w-[1600px]">
          <div className="glass flex flex-col gap-3 rounded-xl px-4 py-3 md:flex-row md:items-center">
            <div className="flex shrink-0 items-center gap-3">
              <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden className="text-sonar"><path d="M3 10h26M6 10c2 9 6 14 10 14s8-5 10-14M16 24v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
              <div>
                <h1 className="font-mono text-base font-semibold tracking-[0.3em] text-ink">KEEL</h1>
                <p className="hidden text-[10px] uppercase tracking-[0.2em] text-ink-faint md:block">code-comprehension workbench</p>
              </div>
            </div>
            <div className="min-w-0 flex-1"><SourceBar /></div>
          </div>
          {hasKey === false && (
            <p className="mt-2 rounded-lg border border-[#ffb86b]/30 bg-hull-950/80 px-4 py-2 text-xs text-[#ffb86b]">
              No <code>OPENAI_API_KEY</code> on the server — ingest and the 3D map work; agent modules will report an error until the key is set.
            </p>
          )}
        </header>

        {/* Desktop panels */}
        {summary && (
          <div className="mx-auto hidden min-h-0 w-full max-w-[1600px] flex-1 gap-3 md:flex">
            <aside className="pointer-events-auto flex w-60 shrink-0 flex-col gap-3">
              <div className="glass rounded-xl p-2"><ModuleSwitch orientation="col" /></div>
              <div className="glass min-h-0 flex-1 rounded-xl p-3"><ActivityLog /></div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col justify-end">
              <div className="mx-auto max-w-[520px]"><SelectedCard /></div>
            </div>
            <main className="pointer-events-auto w-[min(560px,46vw)] shrink-0">
              <div className="glass h-full overflow-y-auto rounded-xl p-5">
                <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-sonar">{MODULES.find((m) => m.id === active)!.name}</h2>
                <ModuleBody id={active} />
              </div>
            </main>
          </div>
        )}
      </div>

      {/* Empty / ingest states */}
      {(empty || ingesting || ingestError) && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-lg text-center">
            {ingestError ? (
              <div className="glass rounded-xl p-5 text-left">
                <ErrorBox {...ingestError} />
                <div className="mt-3 flex gap-2"><Button variant="primary" onClick={() => loadSource({ kind: "demo" }, "harbor-api (demo)")}>Load the demo instead</Button></div>
              </div>
            ) : ingesting ? (
              <p className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs text-ink-dim"><Spinner /> {progress || "Ingesting…"}</p>
            ) : (
              <>
                <h2 className="text-2xl font-light text-ink md:text-3xl">Recover the hidden structure.</h2>
                <p className="mt-3 text-sm text-ink-dim">Point a room of agents at your own repo — or an undocumented dependency you rely on — and get back architecture maps, cited answers, ports, recovered specs and onboarding tours.</p>
                <p className="mt-4 font-mono text-[11px] text-ink-faint">Press <span className="text-sonar">▶ Demo repo</span> to try it on a bundled sample in ~30 seconds.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile layout: drawer */}
      {summary && (
        <div className="md:hidden">
          <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-30">
            <div className="mb-2"><SelectedCard /></div>
            <Button variant="primary" className="w-full" onClick={() => setDrawer(true)}>Open {MODULES.find((m) => m.id === active)!.name}</Button>
          </div>
          {drawer && (
            <div className="fixed inset-0 z-40 flex flex-col bg-hull-950/40" onClick={() => setDrawer(false)}>
              <div className="glass-strong mt-auto flex max-h-[88dvh] flex-col rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 pt-3">
                  <div className="flex gap-1">
                    {(["module", "agents"] as const).map((t) => (
                      <button key={t} onClick={() => setMobileTab(t)} className={`rounded px-2.5 py-1 font-mono text-[11px] uppercase ${mobileTab === t ? "bg-sonar/15 text-sonar" : "text-ink-faint"}`}>{t === "module" ? "Module" : "Agents"}</button>
                    ))}
                  </div>
                  <button className="px-2 py-1 text-ink-dim" onClick={() => setDrawer(false)} aria-label="Close panel">✕</button>
                </div>
                <div className="px-3 pt-2"><ModuleSwitch orientation="row" /></div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div hidden={mobileTab !== "module"}><ModuleBody id={active} /></div>
                  <div hidden={mobileTab !== "agents"} className="h-[60dvh]"><ActivityLog /></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <CodeViewer />
    </div>
  );
}
