"use client";
import { useEffect, useRef, useState } from "react";
import { runModule, openFile } from "@/lib/client/actions";
import { useKeel } from "@/lib/client/store";
import type { InterrogatorResult } from "@/lib/modules/interrogator";
import Markdown from "../ui/Markdown";
import { CiteChip, Spinner } from "../ui/bits";
import { FindingsFeed, RunBar, useRun } from "./common";

const SUGGEST = ["Where is auth enforced?", "What breaks if I delete the pricing module?", "How does a booking get its fee?", "Which inputs are validated, and where?"];

export default function Interrogator() {
  const run = useRun("interrogator");
  const repoId = useKeel((s) => s.summary?.repoId);
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<InterrogatorResult[]>([]);
  const pending = useRef<string>("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory([]);
  }, [repoId]);
  useEffect(() => {
    const r = run.result as InterrogatorResult | undefined;
    if (r && !run.running && history[history.length - 1] !== r) setHistory((h) => [...h, r]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.result, run.running]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [history.length, run.stream]);

  const ask = (question: string) => {
    if (!question.trim() || run.running) return;
    pending.current = question;
    setQ("");
    runModule("interrogator", { question, history: history.map((h) => ({ q: h.question, a: h.answer })) });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-dim">Ask anything about the codebase. A planner fans out readers; every claim comes back with clickable file:line citations.</p>
      <div className="space-y-4">
        {history.map((h, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[90%] border border-sonar/30 bg-sonar/10 px-3 py-2 text-sm text-ink">{h.question}</div>
            <div className="border border-sonar/10 bg-abyss/50 p-3">
              <Markdown text={h.answer} />
              {h.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-sonar/10 pt-2">
                  {h.citations.filter((c, j, a) => a.findIndex((x) => x.path === c.path && x.line === c.line) === j).map((c, j) => (
                    <CiteChip key={j} {...c} onClick={() => openFile(c.path, c.line, c.endLine)} />
                  ))}
                </div>
              )}
              {h.invalidCitations > 0 && <p className="mt-2 text-[11px] text-amber">{h.invalidCitations} citation(s) pointed outside the file and are flagged.</p>}
            </div>
          </div>
        ))}
        {run.running && (
          <div className="space-y-2">
            <div className="ml-auto w-fit max-w-[90%] border border-sonar/30 bg-sonar/10 px-3 py-2 text-sm text-ink">{pending.current}</div>
            <FindingsFeed m="interrogator" collapsed />
            {run.stream ? (
              <div className="border border-sonar/10 bg-abyss/50 p-3"><Markdown text={run.stream} /></div>
            ) : run.findings.length > 0 ? (
              <p className="flex items-center gap-2 text-xs text-ink-faint"><Spinner /> Synthesizer is writing…</p>
            ) : null}
          </div>
        )}
        <div ref={end} />
      </div>
      {history.length === 0 && !run.running && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGEST.map((s) => (
            <button key={s} onClick={() => ask(s)} className="border border-sonar/20 bg-sonar/[0.04] px-3 py-1 font-mono text-[11px] text-ink-dim transition hover:border-sonar/60 hover:text-sonar">{s}</button>
          ))}
        </div>
      )}
      <form className="sticky bottom-0 -mx-1 border-t border-sonar/10 bg-abyss/95 px-1 pb-1 pt-3 backdrop-blur" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <RunBar m="interrogator" label="Ask" onRun={() => ask(q)} disabled={!q.trim()}>
          <label htmlFor="ask" className="sr-only">Question</label>
          <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where is auth enforced? What breaks if I delete X?" className="min-w-0 flex-1 field !font-sans !text-sm" />
        </RunBar>
      </form>
    </div>
  );
}
