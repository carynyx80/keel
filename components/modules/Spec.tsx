"use client";
import { runModule, openFile } from "@/lib/client/actions";
import type { SpecResult } from "@/lib/modules/spec";
import Mermaid from "../ui/Mermaid";
import { CiteChip, CopyButton, DownloadButton, Tabs } from "../ui/bits";
import { FindingsFeed, RunBar, useRun } from "./common";

export default function Spec() {
  const run = useRun("spec");
  const r = run.result as SpecResult | undefined;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-dim">Reconstructs the missing design doc: an OpenAPI spec, the data model as an ER diagram, and the business rules with the lines that enforce them.</p>
      <RunBar m="spec" label="Recover spec" onRun={() => runModule("spec")} />
      <FindingsFeed m="spec" collapsed={!!r} />
      {r && (
        <Tabs tabs={[`OpenAPI (${r.endpointCount})`, `Data model (${r.entities.length})`, `Rules (${r.rules.length})`]}>
          {(t) =>
            t === 0 ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${r.openapiValid ? "bg-sonar/15 text-sonar" : "bg-[#ffb86b]/15 text-[#ffb86b]"}`}>{r.openapiValid ? "structure valid" : `${r.openapiIssues.length} structural issues`}</span>
                  <CopyButton text={r.openapiYaml} />
                  <DownloadButton text={r.openapiYaml} filename="openapi.yaml" />
                </div>
                {!r.openapiValid && <ul className="mb-2 list-disc pl-5 text-xs text-[#ffb86b]">{r.openapiIssues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul>}
                <pre className="max-h-[55vh] overflow-auto rounded-lg bg-hull-950/60 p-3 font-mono text-[11px] leading-5 text-ink/90">{r.openapiYaml}</pre>
              </div>
            ) : t === 1 ? (
              <div className="space-y-3">
                <div className="flex justify-end"><CopyButton text={r.erMermaid} label="Copy Mermaid" /></div>
                <Mermaid code={r.erMermaid} />
              </div>
            ) : (
              <ol className="space-y-2">
                {r.rules.map((x) => (
                  <li key={x.id} className="rounded-lg border border-white/5 bg-hull-950/30 p-2.5 text-sm">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-sonar">{x.id}</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">{x.category}</span>
                      <CiteChip {...x.citation} onClick={() => openFile(x.citation.path, x.citation.line)} />
                    </div>
                    <p className="text-ink/90">{x.rule}</p>
                  </li>
                ))}
              </ol>
            )
          }
        </Tabs>
      )}
    </div>
  );
}
