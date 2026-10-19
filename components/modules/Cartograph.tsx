"use client";
import { runModule } from "@/lib/client/actions";
import type { CartographResult } from "@/lib/modules/cartograph";
import Markdown from "../ui/Markdown";
import Mermaid from "../ui/Mermaid";
import { CopyButton, DownloadButton, Tabs } from "../ui/bits";
import { FindingsFeed, RunBar, useRun } from "./common";

export default function Cartograph() {
  const run = useRun("cartograph");
  const r = run.result as CartographResult | undefined;
  const computed = (r ? { computedMermaid: r.computedMermaid, stats: r.stats } : run.partials.computed?.[0]) as Pick<CartographResult, "computedMermaid" | "stats"> | undefined;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-dim">Maps module boundaries, the dependency graph, public surface vs. internals, and drafts a README.</p>
      <RunBar m="cartograph" label="Map architecture" onRun={() => runModule("cartograph")} />
      {computed && !r && (
        <div>
          <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-dim">Computed module graph (from imports)</h4>
          <Mermaid code={computed.computedMermaid} />
        </div>
      )}
      <FindingsFeed m="cartograph" collapsed={!!r} />
      {r && (
        <Tabs tabs={["Overview", "Diagrams", "README"]}>
          {(t) =>
            t === 0 ? (
              <div className="space-y-4">
                <Markdown text={r.overview} />
                <p className="font-mono text-[11px] text-ink-faint">
                  {r.stats.files} files · {r.stats.lines.toLocaleString()} lines · {r.stats.internalEdges} internal imports · external: {r.stats.externalPackages.join(", ") || "none"}
                </p>
                <div className="space-y-2">
                  {r.modules.map((m) => (
                    <div key={m.name} className="rounded-lg border border-white/5 bg-hull-950/30 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-mono text-sm text-sonar">{m.name}</span>
                        {m.dependsOn.length > 0 && <span className="font-mono text-[10px] text-ink-faint">→ {m.dependsOn.join(", ")}</span>}
                      </div>
                      <p className="mt-1 text-sm text-ink/90">{m.responsibility}</p>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <div><div className="mb-0.5 text-ink-faint">Public surface</div><div className="font-mono text-ink-dim">{m.publicSurface.join(", ") || "—"}</div></div>
                        <div><div className="mb-0.5 text-ink-faint">Internals</div><div className="font-mono text-ink-dim">{m.internals.join(", ") || "—"}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : t === 1 ? (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between"><h4 className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">Runtime architecture (agent-recovered)</h4><CopyButton text={r.architectureMermaid} label="Copy Mermaid" /></div>
                  <Mermaid code={r.architectureMermaid} />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between"><h4 className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">Module dependencies (computed from imports)</h4><CopyButton text={r.computedMermaid} label="Copy Mermaid" /></div>
                  <Mermaid code={r.computedMermaid} />
                </div>
                <p className="text-xs text-ink-faint">The 3D stage is the file-level version of this graph — click any node to inspect it.</p>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex gap-2"><CopyButton text={r.readme} /><DownloadButton text={r.readme} filename="README.md" /></div>
                <Markdown text={r.readme} />
              </div>
            )
          }
        </Tabs>
      )}
    </div>
  );
}
