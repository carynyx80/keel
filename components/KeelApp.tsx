"use client";
import { useEffect, useState } from "react";
import { keel, useKeel } from "@/lib/client/store";
import { loadSource, openFile, runModule } from "@/lib/client/actions";
import type { ModuleId } from "@/lib/engine/types";
import Stage from "./scene/Stage";
import SourceBar from "./SourceBar";
import ActivityLog from "./ActivityLog";
import CodeViewer from "./CodeViewer";
import BootSequence from "./hud/BootSequence";
import Telemetry from "./hud/Telemetry";
import StageOverlay from "./hud/StageOverlay";
import Cartograph from "./modules/Cartograph";
import Interrogator from "./modules/Interrogator";
import Porter from "./modules/Porter";
import Spec from "./modules/Spec";
import Narrator from "./modules/Narrator";
import { Button, ErrorBox, Hud, Spinner } from "./ui/bits";

export const MODULES: { id: ModuleId; code: string; name: string; role: string; glyph: string }[] = [
  { id: "cartograph", code: "ST-01", name: "Cartograph", role: "Hull survey", glyph: "M4 12h16M12 4v16M7 7l10 10M17 7 7 17" },
  { id: "interrogator", code: "ST-02", name: "Interrogator", role: "Sonar Q&A", glyph: "M4 12a8 8 0 0 1 16 0M7 12a5 5 0 0 1 10 0M10 12a2 2 0 0 1 4 0" },
  { id: "porter", code: "ST-03", name: "Porter", role: "Cargo transfer", glyph: "M4 8h13l-3-3M20 16H7l3 3" },
  { id: "spec", code: "ST-04", name: "Spec Recovery", role: "Blueprint salvage", glyph: "M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" },
  { id: "narrator", code: "ST-05", name: "Narrator", role: "Guided dive", glyph: "M5 19 12 5l7 14M8.5 13h7" },
];

function Glyph({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function ModuleBody({ id }: { id: ModuleId }) {
  // Every console stays mounted so in-flight streams and chat history survive station switches.
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

function Stations({ orientation }: { orientation: "row" | "col" }) {
  const active = useKeel((s) => s.active);
  const runs = useKeel((s) => s.runs);
  return (
    <nav aria-label="Stations" className={orientation === "col" ? "flex flex-col" : "flex gap-1 overflow-x-auto pb-1"}>
      {MODULES.map((m, i) => {
        const r = runs[m.id];
        const on = active === m.id;
        const state = r.running ? "amber" : r.error ? "alarm" : r.result ? "sonar" : "faint";
        return (
          <button
            key={m.id}
            onClick={() => keel.set({ active: m.id })}
            aria-current={on ? "page" : undefined}
            className={`group relative flex shrink-0 items-center gap-3 px-3 py-2.5 text-left transition ${orientation === "col" && i > 0 ? "border-t" : ""} ${on ? "bg-sonar/[0.09]" : "hover:bg-sonar/[0.04]"}`}
            style={{ borderColor: "var(--line)" }}
          >
            <span className={`absolute inset-y-1 left-0 w-[2px] transition ${on ? "bg-sonar shadow-[0_0_10px_#35f2c2]" : "bg-transparent"}`} />
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${on ? "border-sonar/70 text-sonar" : "border-sonar/15 text-ink-dim group-hover:text-ink"}`}>
              <Glyph d={m.glyph} className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2">
                <span className="font-mono text-[9px] text-ink-faint">{m.code}</span>
                <span className={`font-hud text-[13px] font-semibold uppercase tracking-[0.1em] ${on ? "text-sonar-glow" : "text-ink"}`}>{m.name}</span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
                <span className={`lamp ${state === "amber" ? "animate-blink text-amber" : state === "alarm" ? "text-alarm" : state === "sonar" ? "text-sonar" : "text-ink-faint/40"}`} />
                {r.running ? "crew deployed" : r.error ? "fault" : r.result ? "report ready" : m.role}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ContactCard() {
  const selected = useKeel((s) => s.selected);
  const graph = useKeel((s) => s.graph);
  const node = selected ? graph?.nodes.find((n) => n.id === selected) : null;
  if (!node) return null;
  const isFile = node.kind === "file";
  return (
    <Hud code="CONTACT" title={node.label} solid className="pointer-events-auto animate-rise" bodyClass="px-3 py-2.5" right={<button className="text-ink-faint hover:text-ink" onClick={() => keel.set({ selected: null })} aria-label="Release contact">✕</button>}>
      <div className="font-mono text-[11px] text-sonar/90">{node.id}</div>
      <div className="mt-2 grid grid-cols-4 gap-3">
        {[["Compartment", node.module], ["Lines", node.lines], ["Branches", node.complexity], ["Links", node.degree]].map(([k, v]) => (
          <div key={String(k)} className="min-w-0"><div className="label !text-[9px]">{k}</div><div className="readout truncate text-xs">{v}</div></div>
        ))}
      </div>
      {isFile && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button className="!py-1 !text-[10px]" onClick={() => openFile(node.id)}>◎ Inspect</Button>
          <Button className="!py-1 !text-[10px]" onClick={() => { keel.set({ active: "interrogator" }); runModule("interrogator", { question: `What is ${node.id} responsible for, and what breaks if it is deleted?`, history: [] }); }}>
            ⚠ Impact if removed
          </Button>
          <Button className="!py-1 !text-[10px]" onClick={() => keel.set({ active: "porter" })}>⇄ Port</Button>
        </div>
      )}
    </Hud>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="text-sonar drop-shadow-[0_0_8px_rgba(53,242,194,.6)]">
        <circle cx="17" cy="17" r="15.5" fill="none" stroke="currentColor" strokeOpacity=".35" />
        <path d="M5 13h24M8 13c2.2 8.5 5.5 12.5 9 12.5s6.8-4 9-12.5M17 25.5V31" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="square" />
      </svg>
      <div className="leading-none">
        <h1 className="font-hud text-[19px] font-bold tracking-[0.42em] text-ink">KEEL</h1>
        {!compact && <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.28em] text-sonar/70">Subsurface code recon</p>}
      </div>
    </div>
  );
}

function EmptyState() {
  const progress = useKeel((s) => s.progress);
  const ingesting = useKeel((s) => s.ingesting);
  const ingestError = useKeel((s) => s.ingestError);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 pt-40">
      <div className="pointer-events-auto max-w-xl text-center">
        {ingestError ? (
          <Hud code="ERR" title="Dive aborted" solid className="text-left">
            <ErrorBox {...ingestError} />
            <div className="mt-3"><Button variant="primary" onClick={() => loadSource({ kind: "demo" }, "harbor-api (demo)")}>▶ Dive the demo vessel instead</Button></div>
          </Hud>
        ) : ingesting ? (
          <div className="hud hud-solid inline-flex items-center gap-3 px-5 py-3 font-mono text-xs text-ink-dim"><Spinner /> {progress || "Descending…"}</div>
        ) : (
          <div className="animate-rise">
            <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-sonar/80">◇ Awaiting contact ◇</p>
            <h2 className="mt-4 font-hud text-4xl font-semibold uppercase leading-[1.05] tracking-[0.06em] text-ink md:text-5xl">
              Dive into<br /><span className="text-sonar drop-shadow-[0_0_24px_rgba(53,242,194,.45)]">any codebase</span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-ink-dim">
              Every repo has a keel: the hidden structure everything else is built on. Send a crew of agents below to survey the hull, answer with citations, port modules, salvage specs and chart a guided dive.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" className="!px-6 !py-3 !text-[13px]" onClick={async () => { if (await loadSource({ kind: "demo" }, "harbor-api (demo)") && keel.get().hasApiKey) runModule("cartograph"); }}>
                ▶ Dive the demo vessel
              </Button>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">or paste a repo URL above</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KeelApp() {
  const active = useKeel((s) => s.active);
  const summary = useKeel((s) => s.summary);
  const hasKey = useKeel((s) => s.hasApiKey);
  const [drawer, setDrawer] = useState(false);
  const [mobileTab, setMobileTab] = useState<"module" | "comms">("module");

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((j) => keel.set({ hasApiKey: j.hasApiKey, model: j.model })).catch(() => {});
  }, []);

  const mod = MODULES.find((m) => m.id === active)!;

  return (
    <div className="crt relative h-dvh w-full overflow-hidden">
      <Stage />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(2,6,10,0.9)_100%)]" />
      <StageOverlay />

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col gap-3 p-3 md:p-4">
        {/* Command bar */}
        <header className="pointer-events-auto mx-auto w-full max-w-[1680px]">
          <div className="hud flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-6">
            <Brand />
            <div className="min-w-0 flex-1"><SourceBar /></div>
            <div className="hidden xl:block"><Telemetry /></div>
          </div>
          {hasKey === false && (
            <p className="mt-2 border border-amber/30 bg-abyss/85 px-4 py-2 font-mono text-[11px] text-amber">
              ⚠ No model link: the server has no API key. Surveys of the hull still run; agent stations will report a fault until a key is set.
            </p>
          )}
        </header>

        {/* Desktop consoles */}
        {summary && (
          <div className="mx-auto hidden min-h-0 w-full max-w-[1680px] flex-1 gap-3 md:flex">
            <aside className="pointer-events-auto flex w-[264px] shrink-0 flex-col gap-3">
              <Hud code="NAV" title="Stations" bodyClass="p-0"><Stations orientation="col" /></Hud>
              <Hud code="COMMS" title="Crew channel" className="flex min-h-0 flex-1 flex-col" bodyClass="min-h-0 flex-1 p-3"><ActivityLog /></Hud>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col justify-end">
              <div className="mx-auto w-full max-w-[460px]"><ContactCard /></div>
            </div>
            <main className="pointer-events-auto flex w-[min(580px,44vw)] shrink-0 flex-col">
              <Hud
                code={mod.code}
                title={`${mod.name} · ${mod.role}`}
                className="flex min-h-0 flex-1 flex-col"
                bodyClass="min-h-0 flex-1 overflow-y-auto p-5"
                right={<Glyph d={mod.glyph} className="h-4 w-4 text-sonar" />}
              >
                <ModuleBody id={active} />
              </Hud>
            </main>
          </div>
        )}
      </div>

      {!summary && <EmptyState />}

      {/* Mobile: drawer */}
      {summary && (
        <div className="md:hidden">
          <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 space-y-2">
            <ContactCard />
            <Button variant="primary" className="w-full !py-3" onClick={() => setDrawer(true)}>▲ Open {mod.name}</Button>
          </div>
          {drawer && (
            <div className="fixed inset-0 z-40 flex flex-col bg-abyss/50" onClick={() => setDrawer(false)}>
              <div className="hud hud-solid mt-auto flex max-h-[88dvh] flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 pt-3">
                  <div className="flex gap-1">
                    {(["module", "comms"] as const).map((t) => (
                      <button key={t} onClick={() => setMobileTab(t)} className={`px-2.5 py-1 font-hud text-[11px] font-semibold uppercase tracking-[0.18em] ${mobileTab === t ? "bg-sonar/15 text-sonar" : "text-ink-faint"}`}>{t === "module" ? "Console" : "Comms"}</button>
                    ))}
                  </div>
                  <button className="px-2 py-1 text-ink-dim" onClick={() => setDrawer(false)} aria-label="Close console">✕</button>
                </div>
                <div className="px-3 pt-2"><Stations orientation="row" /></div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div hidden={mobileTab !== "module"}><ModuleBody id={active} /></div>
                  <div hidden={mobileTab !== "comms"} className="h-[60dvh]"><ActivityLog /></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <CodeViewer />
      <BootSequence />
    </div>
  );
}
