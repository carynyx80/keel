"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useKeelcode, type ModuleRun } from "@/lib/client/store";
import { cancelModule, openFile } from "@/lib/client/actions";
import type { ModuleId } from "@/lib/engine/types";
import { Button, CiteChip, ErrorBox, Spinner } from "../ui/bits";

export function useRun(m: ModuleId): ModuleRun {
  return useKeelcode((s) => s.runs[m]);
}

function Elapsed({ from, to }: { from?: number; to?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (to) return;
    const i = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, [to]);
  if (!from) return null;
  return <span className="font-mono text-[11px] text-ink-faint">{Math.round(((to ?? Date.now()) - from) / 1000)}s</span>;
}

export function RunBar({ m, onRun, label, disabled, children }: { m: ModuleId; onRun: () => void; label: string; disabled?: boolean; children?: ReactNode }) {
  const run = useRun(m);
  const hasKey = useKeelcode((s) => s.hasApiKey);
  const hasRepo = useKeelcode((s) => !!s.summary);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {children}
        {run.running ? (
          <Button type="button" variant="danger" onClick={() => cancelModule(m)}><Spinner /> Cancel</Button>
        ) : (
          <Button type="button" variant="primary" onClick={onRun} disabled={disabled || !hasRepo}>{label}</Button>
        )}
        <Elapsed from={run.startedAt} to={run.finishedAt} />
      </div>
      {!hasRepo && <p className="text-xs text-ink-faint">Load the demo repo, a public Git URL, or a zip first.</p>}
      {hasKey === false && !run.error && (
        <ErrorBox code="NO_API_KEY" message="The server has no OPENAI_API_KEY, so agents can't run. Ingest and the 3D map still work. Add the key in .env.local or the Vercel project's Environment Variables and redeploy." />
      )}
      {run.error && <ErrorBox {...run.error} />}
    </div>
  );
}

export function FindingsFeed({ m, collapsed = false }: { m: ModuleId; collapsed?: boolean }) {
  const run = useRun(m);
  const [open, setOpen] = useState(!collapsed);
  if (!run.findings.length) return run.running ? <p className="flex items-center gap-2 text-xs text-ink-faint"><Spinner /> Planner is choosing slices; reader findings will stream in here…</p> : null;
  return (
    <div className="border border-sonar/10 bg-abyss/40">
      <button className="flex w-full items-center justify-between px-3 py-2 text-left label !text-ink-dim" onClick={() => setOpen(!open)}>
        Reader findings ({run.findings.length}) <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="max-h-72 space-y-3 overflow-auto px-3 pb-3 text-xs">
          {run.findings.map((f) => (
            <li key={f.agent + f.slice}>
              <div className="mb-1 font-mono text-[11px] text-sonar">{f.agent} · {f.slice}</div>
              <p className="mb-1 text-ink-dim">{f.summary}</p>
              <ul className="space-y-1">
                {f.points.slice(0, 6).map((p, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-ink/90">
                    <CiteChip path={p.path} line={p.line} endLine={p.endLine} onClick={() => openFile(p.path, p.line, p.endLine)} />
                    <span>{p.claim}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
