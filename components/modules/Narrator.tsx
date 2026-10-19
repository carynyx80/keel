"use client";
import { useState } from "react";
import { runModule, openFile } from "@/lib/client/actions";
import type { NarratorResult, TourStep } from "@/lib/modules/narrator";
import Markdown from "../ui/Markdown";
import { CopyButton, DownloadButton } from "../ui/bits";
import { FindingsFeed, RunBar, useRun } from "./common";

export default function Narrator() {
  const run = useRun("narrator");
  const [audience, setAudience] = useState("a new backend engineer on their first day");
  const [done, setDone] = useState<Record<number, boolean>>({});
  const r = run.result as NarratorResult | undefined;
  const steps = (r?.steps ?? run.partials.step ?? []) as TourStep[];
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-dim">Generates a sequenced onboarding tour — start here, follow the request to here — with runnable checkpoints.</p>
      <RunBar m="narrator" label="Generate tour" onRun={() => { setDone({}); runModule("narrator", { audience }); }}>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-ink-faint">Audience
          <input value={audience} onChange={(e) => setAudience(e.target.value)} className="rounded-md border border-white/10 bg-hull-950/60 px-3 py-1.5 text-sm text-ink focus:border-sonar/60 focus:outline-none" />
        </label>
      </RunBar>
      {!r && <FindingsFeed m="narrator" collapsed={steps.length > 0} />}
      {r && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg text-ink">{r.title}</h3>
          <div className="flex gap-2"><CopyButton text={r.markdown} /><DownloadButton text={r.markdown} filename="ONBOARDING.md" /></div>
        </div>
      )}
      {r && r.prerequisites.length > 0 && <ul className="list-disc pl-5 text-xs text-ink-dim">{r.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul>}
      <ol className="relative space-y-3 border-l border-sonar/20 pl-5">
        {steps.map((s) => (
          <li key={s.n} className="relative">
            <span className={`absolute -left-[29px] top-1 flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${done[s.n] ? "border-sonar bg-sonar text-hull-950" : "border-sonar/50 bg-hull-900 text-sonar"}`}>{done[s.n] ? "✓" : s.n}</span>
            <div className="rounded-lg border border-white/5 bg-hull-950/30 p-3">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium text-ink">{s.title}</h4>
                <button className={`cite ${s.valid ? "" : "cite-bad"}`} onClick={() => openFile(s.path, s.startLine, s.endLine)}>{s.path}:{s.startLine}-{s.endLine}</button>
              </div>
              <Markdown text={s.explanation} className="text-sm" />
              <div className="mt-2 rounded-md bg-hull-950/50 p-2 text-xs">
                <span className="mr-2 font-mono uppercase text-sonar">{s.checkpoint.kind}</span>
                <span className="text-ink/90">{s.checkpoint.instruction}</span>
                {s.checkpoint.kind === "run" && s.checkpoint.command && (
                  <div className="mt-1.5 flex items-center gap-2"><code className="flex-1 rounded bg-black/40 px-2 py-1 font-mono text-ink">{s.checkpoint.command}</code><CopyButton text={s.checkpoint.command} /></div>
                )}
                {s.checkpoint.kind === "quiz" && s.checkpoint.answer && <details className="mt-1"><summary className="cursor-pointer text-ink-faint">Answer</summary><p className="mt-1 text-ink-dim">{s.checkpoint.answer}</p></details>}
                <label className="mt-2 flex items-center gap-1.5 text-ink-faint"><input type="checkbox" checked={!!done[s.n]} onChange={(e) => setDone({ ...done, [s.n]: e.target.checked })} className="accent-[#2cf5c8]" /> Checkpoint done</label>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
